// routes/ledgerRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb } = require('../config/db');
const { authenticateToken, enforceDistrictAccess } = require('../middleware/auth');
const { getServerToday, enforceSameDayForDealers } = require('../middleware/sameDayCheck');
const { calculateDC } = require('../utils/dcCalculator');

function calculateBalance(entries = []) {
  return entries.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
}

// Get ledger for district and date
router.get('/:district/:date', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district, date } = req.params;
  const serverToday = getServerToday();
  const isReadOnly = (req.user.role !== 'admin' && date !== serverToday);

  const key = `${district}:${date}`;
  const ledger = db.ledgers[key] || [];
  const balance = calculateBalance(ledger);

  res.json({
    district,
    date,
    serverToday,
    isReadOnly,
    ledger,
    balance
  });
});

// Add manual ledger entry
router.post(
  '/:district/:date',
  authenticateToken,
  enforceDistrictAccess,
  enforceSameDayForDealers,
  (req, res) => {
    const { district, date } = req.params;
    const { label, type, amount, sign } = req.body;

    if (!label || label.trim() === '') {
      return res.status(400).json({ error: 'Description label is required' });
    }

    const rawAmt = Math.abs(Number(amount) || 0);
    let signedAmt = rawAmt;

    if (type === 'Opening') {
      signedAmt = rawAmt;
    } else if (type === 'Cash' || type === 'DC') {
      signedAmt = -rawAmt;
    } else if (type === 'Other') {
      signedAmt = rawAmt * (Number(sign) || 1);
    }

    const newEntry = {
      id: 'led_' + Date.now() + Math.random().toString(36).slice(2, 6),
      label: label.trim(),
      type: type || 'Other',
      amount: signedAmt,
      createdAt: new Date().toISOString(),
      createdBy: req.user.username
    };

    const key = `${district}:${date}`;
    if (!db.ledgers[key]) {
      db.ledgers[key] = [];
    }

    db.ledgers[key].push(newEntry);
    saveDb();

    res.status(201).json({
      message: 'Ledger entry added',
      entry: newEntry,
      ledger: db.ledgers[key],
      balance: calculateBalance(db.ledgers[key])
    });
  }
);

// Add automatic DC entry
router.post(
  '/:district/:date/auto-dc',
  authenticateToken,
  enforceDistrictAccess,
  enforceSameDayForDealers,
  (req, res) => {
    const { district, date } = req.params;
    const { price, productName } = req.body;

    const rule = db.dcRules[district];
    const dcRate = calculateDC(rule, price, productName);

    if (dcRate === null || isNaN(dcRate)) {
      return res.status(400).json({ error: `No DC rate rule configured for ${district}` });
    }

    const label = productName
      ? `Auto DC — ${productName}${price ? ` (₹${price})` : ''}`
      : `Auto DC${price ? ` (₹${price})` : ''}`;

    const newEntry = {
      id: 'led_dc_' + Date.now() + Math.random().toString(36).slice(2, 6),
      label,
      type: 'DC',
      amount: -Math.abs(dcRate),
      orderPrice: Number(price) || 0,
      productName: productName || null,
      dcRate,
      createdAt: new Date().toISOString(),
      createdBy: req.user.username
    };

    const key = `${district}:${date}`;
    if (!db.ledgers[key]) {
      db.ledgers[key] = [];
    }

    db.ledgers[key].push(newEntry);
    saveDb();

    res.status(201).json({
      message: 'Auto DC entry added to ledger',
      entry: newEntry,
      ledger: db.ledgers[key],
      balance: calculateBalance(db.ledgers[key])
    });
  }
);

// Delete ledger entry
router.delete(
  '/:district/:date/:id',
  authenticateToken,
  enforceDistrictAccess,
  enforceSameDayForDealers,
  (req, res) => {
    const { district, date, id } = req.params;
    const key = `${district}:${date}`;

    if (!db.ledgers[key]) {
      return res.status(404).json({ error: 'No ledger found for this date' });
    }

    const initialLen = db.ledgers[key].length;
    db.ledgers[key] = db.ledgers[key].filter(e => e.id !== id);

    if (db.ledgers[key].length === initialLen) {
      return res.status(404).json({ error: 'Ledger entry not found' });
    }

    saveDb();

    res.json({
      message: 'Entry removed',
      ledger: db.ledgers[key],
      balance: calculateBalance(db.ledgers[key])
    });
  }
);

module.exports = router;
