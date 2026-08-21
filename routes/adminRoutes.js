// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, saveDb, DISTRICTS } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getServerToday } = require('../middleware/sameDayCheck');

// Require Admin role for all admin routes
router.use(authenticateToken, requireAdmin);

// 1. All-districts daily overview
router.get('/overview', (req, res) => {
  const date = req.query.date || getServerToday();
  const activeProducts = (db.products || []).filter(p => p.isActive !== false);

  const overview = DISTRICTS.map(district => {
    const salesKey = `${district}:${date}`;
    const ledgerKey = `${district}:${date}`;

    const salesData = db.sales[salesKey] || {};
    const ledgerData = db.ledgers[ledgerKey] || [];

    let productsMoved = 0;
    let sumQty = 0;
    let sumSale = 0;
    let sumTransfer = 0;
    let sumFinal = 0;
    let totalSaleValue = 0;

    activeProducts.forEach(p => {
      const entry = salesData[p.id];
      if (entry) {
        const qty = Number(entry.qty) || 0;
        const sale = Number(entry.sale) || 0;
        const transfer = Number(entry.transfer) || 0;
        const price = Number(entry.price) || Number(p.defaultPrice) || 0;
        const total1 = qty + sale;
        const final = total1 + transfer;

        if (final !== 0 || qty !== 0 || sale !== 0 || transfer !== 0) {
          productsMoved++;
        }
        sumQty += qty;
        sumSale += sale;
        sumTransfer += transfer;
        sumFinal += final;
        totalSaleValue += (sale * price);
      }
    });

    let ledgerBalance = 0;
    let dcTotalDeducted = 0;
    let cashDeposited = 0;

    ledgerData.forEach(l => {
      const amt = Number(l.amount) || 0;
      ledgerBalance += amt;
      if (l.type === 'DC') {
        dcTotalDeducted += Math.abs(amt);
      } else if (l.type === 'Cash') {
        cashDeposited += Math.abs(amt);
      }
    });

    const hasActivity = productsMoved > 0 || ledgerData.length > 0;

    return {
      district,
      hasActivity,
      productsMoved,
      sumQty,
      sumSale,
      sumTransfer,
      sumFinal,
      totalSaleValue,
      ledgerBalance,
      dcTotalDeducted,
      cashDeposited,
      ledgerEntriesCount: ledgerData.length
    };
  });

  const totals = overview.reduce(
    (acc, curr) => ({
      districtsActive: acc.districtsActive + (curr.hasActivity ? 1 : 0),
      totalProductsMoved: acc.totalProductsMoved + curr.productsMoved,
      totalQty: acc.totalQty + curr.sumQty,
      totalSale: acc.totalSale + curr.sumSale,
      totalTransfer: acc.totalTransfer + curr.sumTransfer,
      totalFinal: acc.totalFinal + curr.sumFinal,
      totalSaleValue: acc.totalSaleValue + curr.totalSaleValue,
      totalLedgerBalance: acc.totalLedgerBalance + curr.ledgerBalance,
      totalDCDeductions: acc.totalDCDeductions + curr.dcTotalDeducted,
      totalCashDeposited: acc.totalCashDeposited + curr.cashDeposited
    }),
    {
      districtsActive: 0,
      totalProductsMoved: 0,
      totalQty: 0,
      totalSale: 0,
      totalTransfer: 0,
      totalFinal: 0,
      totalSaleValue: 0,
      totalLedgerBalance: 0,
      totalDCDeductions: 0,
      totalCashDeposited: 0
    }
  );

  res.json({
    date,
    serverToday: getServerToday(),
    overview,
    totals
  });
});

// 2. Date range analytics
router.get('/date-range-summary', (req, res) => {
  const { start, end, district } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'Start and end date required' });
  }

  const targetDistricts = district ? [district] : DISTRICTS;
  const daysMap = {};

  // Gather all recorded dates in range
  Object.keys(db.sales).concat(Object.keys(db.ledgers)).forEach(k => {
    const [dist, d] = k.split(':');
    if (d >= start && d <= end && targetDistricts.includes(dist)) {
      if (!daysMap[d]) daysMap[d] = {};
      if (!daysMap[d][dist]) daysMap[d][dist] = { sales: 0, qty: 0, final: 0, dc: 0, balance: 0 };
    }
  });

  res.json({
    start,
    end,
    targetDistricts,
    days: daysMap
  });
});

// 3. User management
router.get('/users', (req, res) => {
  const users = db.users.map(u => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    district: u.district,
    createdAt: u.createdAt
  }));
  res.json({ users });
});

// 4. Reset dealer password
router.post('/reset-password', (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword) {
    return res.status(400).json({ error: 'userId and newPassword are required' });
  }

  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const salt = bcrypt.genSaltSync(10);
  user.passwordHash = bcrypt.hashSync(newPassword, salt);
  saveDb();

  res.json({ message: `Password reset successfully for ${user.username}` });
});

// 5. Activity logs with filters
router.get('/activity-logs', (req, res) => {
  const { user, district, action, limit } = req.query;
  let logs = db.activityLogs || [];

  if (user) {
    logs = logs.filter(l => l.username.toLowerCase() === user.toLowerCase());
  }
  if (district) {
    logs = logs.filter(l => l.district && l.district.toLowerCase() === district.toLowerCase());
  }
  if (action) {
    logs = logs.filter(l => l.action === action);
  }

  const max = Number(limit) || 200;
  res.json({
    total: logs.length,
    activityLogs: logs.slice(0, max)
  });
});

// 6. Get District DC Rules
const { DEFAULT_DC_RULES, describeRule } = require('../utils/dcCalculator');
router.get('/dc-rules', (req, res) => {
  if (!db.dcRules || Object.keys(db.dcRules).length === 0) {
    db.dcRules = JSON.parse(JSON.stringify(DEFAULT_DC_RULES));
  }

  const list = DISTRICTS.map(dist => {
    const rule = db.dcRules[dist] || DEFAULT_DC_RULES[dist] || { type: 'flat', value: 200 };
    return {
      district: dist,
      rule,
      description: describeRule(rule)
    };
  });

  res.json({ dcRules: list });
});

// 7. Admin: Update DC Rule for a District
router.post('/update-district-dc', (req, res) => {
  const { district, rule } = req.body;
  if (!district || !rule) {
    return res.status(400).json({ error: 'district and rule configuration are required' });
  }

  if (!db.dcRules) db.dcRules = {};
  db.dcRules[district] = rule;

  const { logActivity } = require('../config/db');
  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'DC_RULE_UPDATE',
    `Updated DC rule for ${district}: ${describeRule(rule)}`
  );

  saveDb();

  res.json({
    message: `DC rule updated for ${district}`,
    district,
    rule,
    description: describeRule(rule)
  });
});

module.exports = router;
