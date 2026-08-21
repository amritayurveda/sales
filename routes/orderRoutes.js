// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb, logActivity } = require('../config/db');
const { authenticateToken, enforceDistrictAccess } = require('../middleware/auth');
const { getServerToday, enforceSameDayForDealers } = require('../middleware/sameDayCheck');
const { calculateDC } = require('../utils/dcCalculator');
const { triggerLiveEventSync } = require('../services/googleSheetsSync');

// 1. Create a customer order (Direct Product + Fully Editable Price)
router.post(
  ['/create-order', '/create-scheme-order'],
  authenticateToken,
  enforceDistrictAccess,
  enforceSameDayForDealers,
  (req, res) => {
    const { district, date, productId, price, qty, customerMobile, customerName, schemeName, note } = req.body;

    if (!district || !productId) {
      return res.status(400).json({ error: 'district and productId are required' });
    }

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({ error: 'Valid positive product price (₹) is required' });
    }

    if (!customerMobile || customerMobile.trim().length < 8) {
      return res.status(400).json({ error: 'Valid Customer Mobile Number (minimum 8-10 digits) is required' });
    }

    const cleanMobile = customerMobile.trim();
    const cleanCustomerName = (customerName || 'Customer').trim();
    const orderQty = Number(qty) || 1;

    // 1. Find product
    const distProds = db.districtProducts[district] || [];
    const item = distProds.find(p => p.productId === productId || p.id === productId);
    const master = (db.products || []).find(p => p.id === productId || p.name.toUpperCase() === (item ? item.name.toUpperCase() : ''));
    const prodName = (master && master.name) || (item && item.name) || 'Product';

    // 2. Compute DC using active district rule
    const rule = db.dcRules ? db.dcRules[district] : null;
    let dcRate = calculateDC(rule, priceNum, prodName, district);
    if (dcRate === null || dcRate === undefined) {
      dcRate = priceNum <= 1500 ? 200 : 250;
    }

    const netAmount = priceNum - dcRate;

    // 3. Create Order Record
    const orderId = 'ord_' + Date.now() + Math.random().toString(36).slice(2, 6);
    const orderNo = 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 8);

    const newOrder = {
      id: orderId,
      orderNo,
      district,
      date: date || getServerToday(),
      time: timeStr,
      productId: (item && item.productId) || productId,
      productName: prodName,
      schemeName: schemeName || `${prodName} (₹${priceNum.toLocaleString('en-IN')})`,
      qty: orderQty,
      unitPrice: priceNum,
      dcRate,
      totalAmount: priceNum,
      netAmount,
      customerMobile: cleanMobile,
      customerName: cleanCustomerName,
      note: note || '',
      dealerUsername: req.user.username,
      createdAt: now.toISOString()
    };

    if (!db.customerOrders) db.customerOrders = [];
    db.customerOrders.unshift(newOrder);

    logActivity(
      req.user.id,
      req.user.username,
      req.user.role,
      district,
      'CUSTOMER_SALE',
      `Order ${orderNo}: Sold ${prodName} (Price: ₹${priceNum}, DC: ₹${dcRate}, Net: ₹${netAmount}) to ${cleanCustomerName} [${cleanMobile}]`
    );

    saveDb();

    // Trigger live background sync to Google Sheet
    triggerLiveEventSync(district, date, 'NEW_ORDER', newOrder);

    res.status(201).json({
      message: `Order ${orderNo} recorded successfully`,
      order: newOrder
    });
  }
);

// 2. Delete / Void customer order
router.delete(
  '/:district/:date/:id',
  authenticateToken,
  enforceDistrictAccess,
  enforceSameDayForDealers,
  (req, res) => {
    const { district, date, id } = req.params;
    const initialLen = db.customerOrders.length;
    db.customerOrders = db.customerOrders.filter(o => o.id !== id);

    if (db.customerOrders.length === initialLen) {
      return res.status(404).json({ error: 'Order not found' });
    }

    logActivity(req.user.id, req.user.username, req.user.role, district, 'ORDER_VOID', `Voided customer order ${id}`);
    saveDb();

    res.json({ message: 'Order removed successfully' });
  }
);

// 3. Get customer orders for a district & date
router.get('/district/:district', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district } = req.params;
  const { date } = req.query;

  let orders = (db.customerOrders || []).filter(o => o.district === district);
  if (date) {
    orders = orders.filter(o => o.date === date);
  }

  res.json({
    district,
    date: date || null,
    orders,
    totalOrders: orders.length,
    totalSalesGross: orders.reduce((sum, o) => sum + (Number(o.unitPrice) || 0), 0),
    totalDC: orders.reduce((sum, o) => sum + (Number(o.dcRate) || 0), 0),
    totalSalesNet: orders.reduce((sum, o) => sum + ((Number(o.unitPrice) || 0) - (Number(o.dcRate) || 0)), 0)
  });
});

module.exports = router;
