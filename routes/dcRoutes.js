// routes/dcRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb, DISTRICTS } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { calculateDC, describeRule } = require('../utils/dcCalculator');

// Get DC rules for all districts
router.get('/', authenticateToken, (req, res) => {
  const rulesWithDescriptions = {};
  DISTRICTS.forEach(dist => {
    const rule = db.dcRules[dist] || null;
    rulesWithDescriptions[dist] = {
      rule,
      description: describeRule(rule)
    };
  });
  res.json({ rules: rulesWithDescriptions });
});

// Get DC rule for specific district
router.get('/:district', authenticateToken, (req, res) => {
  const { district } = req.params;
  const rule = db.dcRules[district] || null;
  res.json({
    district,
    rule,
    description: describeRule(rule)
  });
});

// Calculate DC for order
router.post('/calculate', authenticateToken, (req, res) => {
  const { district, price, productName } = req.body;
  if (!district) {
    return res.status(400).json({ error: 'District is required' });
  }

  const rule = db.dcRules[district];
  const rate = calculateDC(rule, price, productName);

  res.json({
    district,
    price: Number(price) || 0,
    productName: productName || null,
    rate,
    description: describeRule(rule)
  });
});

// Update DC rule (Admin can update all; Dealers can update their custom rate if custom rule)
router.put('/:district', authenticateToken, async (req, res) => {
  const { district } = req.params;
  const { rule, customRate } = req.body;

  if (req.user.role !== 'admin' && req.user.district !== district) {
    return res.status(403).json({ error: 'Unauthorized to update DC rules for this district' });
  }

  if (req.user.role === 'admin' && rule) {
    db.dcRules[district] = rule;
  } else if (customRate !== undefined) {
    const rateNum = Number(customRate);
    if (isNaN(rateNum)) {
      return res.status(400).json({ error: 'Valid custom rate number is required' });
    }
    // Update or set as custom/flat rate
    if (!db.dcRules[district] || db.dcRules[district].type === 'custom') {
      db.dcRules[district] = { type: 'custom', value: rateNum };
    } else {
      // If flat, update value
      db.dcRules[district].value = rateNum;
    }
  }

  await saveDb();
  res.json({
    message: `DC rule updated for ${district}`,
    rule: db.dcRules[district],
    description: describeRule(db.dcRules[district])
  });
});

module.exports = router;
