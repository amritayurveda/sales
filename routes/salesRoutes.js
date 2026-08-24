// routes/salesRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb } = require('../config/db');
const { authenticateToken, enforceDistrictAccess } = require('../middleware/auth');
const { getServerToday, enforceSameDayForDealers } = require('../middleware/sameDayCheck');

// Get sales entries for district and date
router.get('/:district/:date', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district, date } = req.params;
  const serverToday = getServerToday();
  const isReadOnly = (req.user.role !== 'admin' && date !== serverToday);

  const key = `${district}:${date}`;
  const entries = db.sales[key] || {};

  res.json({
    district,
    date,
    serverToday,
    isReadOnly,
    entries
  });
});

// Save / Update batch sales entries for district and date
router.post(
  '/:district/:date',
  authenticateToken,
  enforceDistrictAccess,
  enforceSameDayForDealers,
  async (req, res) => {
    const { district, date } = req.params;
    const { entries } = req.body;

    if (!entries || typeof entries !== 'object') {
      return res.status(400).json({ error: 'Entries object is required' });
    }

    const key = `${district}:${date}`;
    db.sales[key] = entries;

    const { logActivity } = require('../config/db');
    logActivity(
      req.user.id,
      req.user.username,
      req.user.role,
      district,
      'SAVE_SALES',
      `Saved sales register for ${district} on ${date}`
    );

    await saveDb();

    res.json({
      message: 'Sales register saved successfully',
      district,
      date,
      entries: db.sales[key]
    });
  }
);

// Save / update single product entry
router.post(
  '/:district/:date/entry',
  authenticateToken,
  enforceDistrictAccess,
  enforceSameDayForDealers,
  async (req, res) => {
    const { district, date } = req.params;
    const { productId, qty, sale, transfer, price } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const key = `${district}:${date}`;
    if (!db.sales[key]) {
      db.sales[key] = {};
    }

    db.sales[key][productId] = {
      qty: Number(qty) || 0,
      sale: Number(sale) || 0,
      transfer: Number(transfer) || 0,
      price: Number(price) || 0
    };

    await saveDb();

    res.json({
      message: 'Product entry updated',
      district,
      date,
      entry: db.sales[key][productId]
    });
  }
);

module.exports = router;
