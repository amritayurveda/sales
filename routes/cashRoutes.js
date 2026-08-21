// routes/cashRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb, logActivity } = require('../config/db');
const { authenticateToken, requireAdmin, enforceDistrictAccess } = require('../middleware/auth');
const { triggerLiveEventSync } = require('../services/googleSheetsSync');
const { computeDistrictDayCash } = require('../utils/cashRollover');
const { getServerToday } = require('../middleware/sameDayCheck');

// 1. Get exact Rolling Cash Ledger matching the Excel report formula for a district and date
router.get('/daily-ledger/:district/:date', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district, date } = req.params;
  const cashData = computeDistrictDayCash(db, district, date);
  res.json(cashData);
});

// 1.1 Get Full Historical Daily Cash Ledger & Every Cash Entry for a district
const { computeDistrictFullCashHistory } = require('../utils/cashRollover');
router.get('/district-full-history/:district', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district } = req.params;
  const historyData = computeDistrictFullCashHistory(db, district);
  res.json(historyData);
});

// 2. Admin-Only: Record cash payment / settlement paid by dealer to company on a specific date
router.post('/admin-payment', authenticateToken, requireAdmin, (req, res) => {
  const { district, date, amount, paymentMode, note } = req.body;
  const amtNum = Number(amount);

  if (!district || !date || isNaN(amtNum) || amtNum <= 0) {
    return res.status(400).json({ error: 'district, date, and positive cash amount are required' });
  }

  const receiptNo = 'CASH-' + Math.floor(100000 + Math.random() * 900000);
  const newSettlement = {
    id: 'set_' + Date.now() + Math.random().toString(36).slice(2, 6),
    receiptNo,
    district,
    date,
    amount: amtNum,
    paymentMode: paymentMode || 'Cash Deposit',
    note: note || 'Dealer cash payment collected by Admin',
    receivedBy: req.user.username,
    createdAt: new Date().toISOString()
  };

  if (!db.cashSettlements) db.cashSettlements = [];
  db.cashSettlements.unshift(newSettlement);

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'CASH_SETTLEMENT',
    `Collected ₹${amtNum} payment from ${district} on ${date} (Receipt: ${receiptNo})`
  );

  saveDb();

  // Trigger live background sync to Google Sheet
  triggerLiveEventSync(district, date, 'CASH_PAYMENT', newSettlement);

  const updatedCash = computeDistrictDayCash(db, district, date);

  res.status(201).json({
    message: `Recorded ₹${amtNum} cash payment for ${district}`,
    settlement: newSettlement,
    cashLedger: updatedCash
  });
});

// 3. Admin-Only: Set / Override base opening cash for a district
router.post('/base-opening-cash', authenticateToken, requireAdmin, (req, res) => {
  const { district, baseOpeningCash } = req.body;
  const num = Number(baseOpeningCash);
  if (!district || isNaN(num)) {
    return res.status(400).json({ error: 'Valid district and baseOpeningCash are required' });
  }

  if (!db.baseOpeningCash) db.baseOpeningCash = {};
  db.baseOpeningCash[district] = num;

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'BASE_CASH_UPDATE',
    `Updated base opening cash for ${district} to ₹${num}`
  );

  saveDb();
  res.json({ message: `Base opening cash updated for ${district}`, baseOpeningCash: num });
});

module.exports = router;
