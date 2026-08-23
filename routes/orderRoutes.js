// routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb, logActivity } = require('../config/db');
const { authenticateToken, enforceDistrictAccess } = require('../middleware/auth');
const { getServerToday, enforceSameDayForDealers } = require('../middleware/sameDayCheck');
const { calculateDC } = require('../utils/dcCalculator');
const { getDistrictProductsSafely } = require('../utils/cashRollover');
const { triggerLiveEventSync } = require('../services/googleSheetsSync');

const { pool } = require('../config/postgres');

// 1. Create a customer order (Direct Product + Fully Editable Price)
router.post(
  ['/create-order', '/create-scheme-order'],
  authenticateToken,
  enforceDistrictAccess,
  enforceSameDayForDealers,
  async (req, res) => {
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

    // 1. Find product safely with case-insensitive district lookup
    const distProds = getDistrictProductsSafely(db, district);
    const item = distProds.find(p => p.productId === productId || p.id === productId || (p.name && p.name.toUpperCase() === productId.toUpperCase()));
    const master = (db.products || []).find(p => p.id === productId || (p.name && p.name.toUpperCase() === ((item ? item.name : productId) || '').toUpperCase()));
    const prodName = (master && master.name) || (item && item.name) || productId;

    // 2. Compute DC using active district rule and isSpecial flag
    const rule = (db.dcRules && (db.dcRules[district] || db.dcRules[district.toLowerCase()])) || null;
    const isSpecial = (item && item.isSpecial) || (master && master.isSpecial) || false;
    const prodObj = { name: prodName, isSpecial };
    let dcRate = calculateDC(rule, priceNum, prodObj, district);
    if (dcRate === null || dcRate === undefined) {
      dcRate = 200;
    }

    const totalAmount = priceNum * orderQty;
    const netAmount = totalAmount - dcRate;

    // 3. Deduct stock
    if (item) {
      item.currentStock = Math.max(0, (Number(item.currentStock) || 0) - orderQty);
    }

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
      totalAmount: totalAmount,
      netAmount,
      customerMobile: cleanMobile,
      customerName: cleanCustomerName,
      note: note || '',
      dealerUsername: req.user.username,
      createdAt: now.toISOString()
    };

    if (!db.customerOrders) db.customerOrders = [];
    db.customerOrders.unshift(newOrder);
    db.lastOrderTimestamp = Date.now();
    db.lastOrder = newOrder;

    logActivity(
      req.user.id,
      req.user.username,
      req.user.role,
      district,
      'CUSTOMER_SALE',
      `Order ${orderNo}: Sold ${prodName} (Price: ₹${priceNum}, DC: ₹${dcRate}, Net: ₹${netAmount}) to ${cleanCustomerName} [${cleanMobile}]`
    );

    await saveDb();

    // Insert directly into Neon PostgreSQL customer_orders table (Guaranteed persist before response)
    try {
      await pool.query(
        `INSERT INTO customer_orders (id, order_no, district, order_date, order_time, product_id, product_name, qty, unit_price, dc_rate, net_amount, customer_mobile, customer_name, note, dealer_username, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO NOTHING`,
        [newOrder.id, newOrder.orderNo, newOrder.district, newOrder.date, newOrder.time, newOrder.productId, newOrder.productName, newOrder.qty, newOrder.unitPrice, newOrder.dcRate, newOrder.netAmount, newOrder.customerMobile, newOrder.customerName, newOrder.note, newOrder.dealerUsername, newOrder.createdAt]
      );
    } catch (err) {
      console.error('Postgres order insert error:', err.message);
    }

    // Trigger live background sync to Google Sheet
    triggerLiveEventSync(district, date, 'NEW_ORDER', newOrder);

    res.status(201).json({
      message: `Order ${orderNo} recorded successfully`,
      order: newOrder
    });
  }
);

// 2. Delete / Void customer order (ADMIN ONLY: Admin can delete any sale)
router.delete(
  ['/:district/:date/:id', '/:id'],
  authenticateToken,
  async (req, res) => {
    // Strictly restrict order deletion to Admin only
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Permission Denied: Deliveries cannot be deleted by dealers. Only Admin can delete sales.'
      });
    }

    const { district, date, id } = req.params;
    const targetOrder = (db.customerOrders || []).find(o => o.id === id || o.orderNo === id);

    if (!targetOrder) {
      return res.status(404).json({ error: 'Sale order not found' });
    }

    const orderDist = targetOrder.district || district;
    const orderDate = targetOrder.date || date;

    // 1. Remove from in-memory customer orders
    db.customerOrders = db.customerOrders.filter(o => o.id !== targetOrder.id && o.orderNo !== targetOrder.orderNo);

    // 2. Restore deducted stock for district product
    if (orderDist && db.districtProducts && db.districtProducts[orderDist]) {
      const item = db.districtProducts[orderDist].find(p => 
        p.productId === targetOrder.productId || 
        p.id === targetOrder.productId || 
        p.name.toUpperCase() === (targetOrder.productName || '').toUpperCase()
      );
      if (item) {
        item.currentStock = (item.currentStock || 0) + (Number(targetOrder.qty) || 1);
      }
    }

    db.lastOrderTimestamp = Date.now();

    logActivity(
      req.user.id,
      req.user.username,
      req.user.role,
      orderDist,
      'ORDER_DELETED',
      `Admin deleted customer order #${targetOrder.orderNo} (${targetOrder.productName} - ₹${targetOrder.unitPrice}) in ${orderDist}`
    );

    await saveDb();

    // 3. Delete directly from Neon PostgreSQL customer_orders table
    try {
      await pool.query('DELETE FROM customer_orders WHERE id = $1 OR order_no = $1', [targetOrder.id]);
    } catch (pgErr) {
      console.error('Postgres delete customer order error:', pgErr.message);
    }

    res.json({
      message: `Sale order #${targetOrder.orderNo} deleted successfully by Admin`,
      deletedOrder: targetOrder
    });
  }
);

// 3. Strictly block editing of deliveries by anyone (Dealers and Admin)
router.all(['/edit-order', '/update-order'], authenticateToken, (req, res) => {
  return res.status(403).json({
    error: 'Immutability Rule: Deliveries cannot be edited once recorded.'
  });
});

router.put('/:id', authenticateToken, (req, res) => {
  return res.status(403).json({ error: 'Immutability Rule: Deliveries cannot be edited.' });
});

router.patch('/:id', authenticateToken, (req, res) => {
  return res.status(403).json({ error: 'Immutability Rule: Deliveries cannot be edited.' });
});

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
