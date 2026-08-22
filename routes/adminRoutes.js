// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, saveDb, DISTRICTS, getDistricts, EXCEL_PRODUCTS, logActivity } = require('../config/db');
const { pool } = require('../config/postgres');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getServerToday } = require('../middleware/sameDayCheck');

// Require Admin role for all admin routes
router.use(authenticateToken, requireAdmin);

// 0. Real-time Live Feed / Instant Change Notification
router.get('/live-feed', (req, res) => {
  const date = req.query.date || getServerToday();
  const since = Number(req.query.since) || 0;

  const todayOrders = (db.customerOrders || []).filter(o => o.date === date);
  const latestOrder = todayOrders[0] || null;
  const lastTimestamp = db.lastOrderTimestamp || (latestOrder ? new Date(latestOrder.createdAt).getTime() : Date.now());

  const hasNew = (since > 0 && lastTimestamp > since);

  res.json({
    serverTime: Date.now(),
    date,
    lastTimestamp,
    hasNew,
    totalTodayOrders: todayOrders.length,
    latestOrder: latestOrder ? {
      id: latestOrder.id,
      orderNo: latestOrder.orderNo,
      district: latestOrder.district,
      productName: latestOrder.productName,
      unitPrice: latestOrder.unitPrice,
      dcRate: latestOrder.dcRate,
      netAmount: latestOrder.netAmount,
      customerMobile: latestOrder.customerMobile,
      customerName: latestOrder.customerName,
      time: latestOrder.time,
      createdAt: latestOrder.createdAt
    } : null
  });
});

// 1. All-districts daily overview
const { computeDistrictDayStock, computeDistrictDayCash } = require('../utils/cashRollover');

router.get('/overview', (req, res) => {
  const date = req.query.date || getServerToday();
  const activeDistricts = getDistricts();

  const overview = activeDistricts.map(district => {
    const stockData = computeDistrictDayStock(db, district, date);
    const cashData = computeDistrictDayCash(db, district, date);

    let productsMoved = 0;
    let sumQty = 0;
    let sumSale = 0;
    let sumTransfer = 0;
    let sumFinal = 0;
    let totalSaleValue = 0;

    (stockData.products || []).forEach(p => {
      const op = Number(p.openingStock) || 0;
      const sale = Number(p.saleQty) || 0;
      const mila = Number(p.milaQty) || 0;
      const closing = Number(p.closingStock) || 0;

      if (op !== 0 || sale !== 0 || mila !== 0 || closing !== 0) {
        productsMoved++;
      }
      sumQty += op;
      sumSale += sale;
      sumTransfer += mila;
      sumFinal += closing;
    });

    let dcTotalDeducted = 0;
    (cashData.orders || []).forEach(o => {
      totalSaleValue += (Number(o.unitPrice) || Number(o.totalAmount) || 0);
      dcTotalDeducted += (Number(o.dcRate) || 0);
    });

    const hasActivity = sumSale > 0 || sumTransfer > 0 || (cashData.orders && cashData.orders.length > 0) || (cashData.settlements && cashData.settlements.length > 0);

    return {
      district,
      hasActivity,
      productsMoved,
      sumQty: Math.round(sumQty * 10) / 10,
      sumSale: Math.round(sumSale * 10) / 10,
      sumTransfer: Math.round(sumTransfer * 10) / 10,
      sumFinal: Math.round(sumFinal * 10) / 10,
      totalSaleValue,
      ledgerBalance: cashData.closingCash,
      dcTotalDeducted,
      cashDeposited: cashData.adminCashPaid,
      ledgerEntriesCount: (cashData.orders || []).length + (cashData.settlements || []).length
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

  const activeDistricts = getDistricts();
  const targetDistricts = district ? [district] : activeDistricts;
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

// 3. User management (Get all users)
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

  // Update Neon PostgreSQL
  pool.query(
    `UPDATE users SET password_hash = $1 WHERE id = $2`,
    [user.passwordHash, user.id]
  ).catch(err => console.error('Postgres user password update error:', err.message));

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    user.district,
    'PASSWORD_RESET',
    `Reset password for ${user.username} (${user.district || 'Admin'})`
  );

  saveDb();

  res.json({ message: `Password reset successfully for ${user.username}` });
});

// 5. Admin: Edit Dealer Account (Username, Name, Password, District)
router.post('/update-dealer', async (req, res) => {
  const { userId, username, password, name, district } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'User account not found' });
  }

  const changes = [];

  if (username && username.trim().toLowerCase() !== user.username.toLowerCase()) {
    const newUsername = username.trim().toLowerCase();
    const exists = db.users.find(u => u.id !== userId && u.username.toLowerCase() === newUsername);
    if (exists) {
      return res.status(400).json({ error: `Username "${newUsername}" is already in use by another account` });
    }
    changes.push(`Username: "${user.username}" -> "${newUsername}"`);
    user.username = newUsername;
  }

  if (password && password.trim()) {
    const salt = bcrypt.genSaltSync(10);
    user.passwordHash = bcrypt.hashSync(password.trim(), salt);
    changes.push('Password updated');
  }

  if (name && name.trim()) {
    user.name = name.trim();
    changes.push(`Name: "${user.name}"`);
  }

  if (district && district.trim()) {
    user.district = district.trim();
    changes.push(`District: "${user.district}"`);
  }

  // Update Neon PostgreSQL
  pool.query(
    `UPDATE users SET username = $1, name = $2, password_hash = $3, district = $4 WHERE id = $5`,
    [user.username, user.name, user.passwordHash, user.district, user.id]
  ).catch(err => console.error('Postgres user update error:', err.message));

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    user.district,
    'DEALER_ACCOUNT_UPDATE',
    `Updated dealer account (${user.username}): ${changes.join(', ')}`
  );

  await saveDb();

  res.json({
    message: `Dealer account for "${user.name}" (${user.username}) updated successfully!`,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      district: user.district
    }
  });
});

// 6. District Management (List all districts with dealer details)
router.get('/districts', (req, res) => {
  const activeDistricts = getDistricts();
  const list = activeDistricts.map(dist => {
    const dealer = (db.users || []).find(u => u.role === 'dealer' && u.district && u.district.toLowerCase() === dist.toLowerCase());
    const products = (db.districtProducts && db.districtProducts[dist]) ? db.districtProducts[dist].length : 0;
    const dcRule = (db.dcRules && db.dcRules[dist]) || { type: 'flat', value: 200 };
    return {
      name: dist,
      dealer: dealer ? {
        id: dealer.id,
        username: dealer.username,
        name: dealer.name,
        createdAt: dealer.createdAt
      } : null,
      productCount: products,
      dcRule
    };
  });

  res.json({
    districts: list,
    totalCount: list.length
  });
});

// 7. Admin: Add New District
router.post('/add-district', async (req, res) => {
  const { district, username, password, name, dcRate } = req.body;
  const trimmedDist = (district || '').trim();
  const trimmedUser = (username || '').trim().toLowerCase();
  const trimmedPass = (password || '').trim();
  const trimmedName = (name || `${trimmedDist} Dealer`).trim();

  if (!trimmedDist) {
    return res.status(400).json({ error: 'District name is required' });
  }
  if (!trimmedUser || !trimmedPass) {
    return res.status(400).json({ error: 'Dealer username and password are required' });
  }

  if (!db.districts) db.districts = [...DISTRICTS];
  if (db.districts.some(d => d.toLowerCase() === trimmedDist.toLowerCase())) {
    return res.status(400).json({ error: `District "${trimmedDist}" already exists` });
  }

  if (db.users.some(u => u.username.toLowerCase() === trimmedUser)) {
    return res.status(400).json({ error: `Username "${trimmedUser}" is already taken` });
  }

  // 1. Add to districts
  db.districts.push(trimmedDist);

  // 2. Create dealer account
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(trimmedPass, salt);
  const newUser = {
    id: 'u_dealer_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    username: trimmedUser,
    name: trimmedName,
    passwordHash,
    role: 'dealer',
    district: trimmedDist,
    createdAt: new Date().toISOString()
  };
  db.users.push(newUser);

  // 3. Seed district products & schemes from Master Catalog / EXCEL_PRODUCTS
  if (!db.districtProducts) db.districtProducts = {};
  db.districtProducts[trimmedDist] = EXCEL_PRODUCTS.map((p, idx) => ({
    id: `dp_${trimmedDist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3)}_p${idx + 1}`,
    productId: `prod_${idx + 1}`,
    name: p.name,
    schemePrice: p.schemes[0].price,
    stockAllocated: p.defaultStock,
    currentStock: p.defaultStock,
    schemes: JSON.parse(JSON.stringify(p.schemes)),
    isActive: true
  }));

  // 4. Seed DC Rule
  if (!db.dcRules) db.dcRules = {};
  db.dcRules[trimmedDist] = { type: 'flat', value: Number(dcRate) || 200 };

  // 5. Insert to Neon PostgreSQL users table
  try {
    await pool.query(
      `INSERT INTO users (id, username, name, password_hash, role, district, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (username) DO UPDATE SET name = $3, password_hash = $4, district = $6`,
      [newUser.id, newUser.username, newUser.name, newUser.passwordHash, newUser.role, newUser.district, newUser.createdAt]
    );
  } catch (err) {
    console.error('Postgres user insert error:', err.message);
  }

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    trimmedDist,
    'DISTRICT_CREATED',
    `Added new district "${trimmedDist}" with dealer account "${trimmedUser}"`
  );

  await saveDb();

  res.status(201).json({
    message: `District "${trimmedDist}" and dealer account "${trimmedUser}" created successfully!`,
    district: trimmedDist,
    user: {
      id: newUser.id,
      username: newUser.username,
      name: newUser.name,
      district: newUser.district
    }
  });
});

// 8. Admin: Delete / Remove District
router.post('/delete-district', async (req, res) => {
  const { district } = req.body;
  const trimmedDist = (district || '').trim();

  if (!trimmedDist) {
    return res.status(400).json({ error: 'District name is required' });
  }

  if (!db.districts) db.districts = [...DISTRICTS];
  const index = db.districts.findIndex(d => d.toLowerCase() === trimmedDist.toLowerCase());
  if (index === -1) {
    return res.status(404).json({ error: `District "${trimmedDist}" not found` });
  }

  const actualDistName = db.districts[index];
  db.districts.splice(index, 1);

  if (!db.deletedDistricts) db.deletedDistricts = [];
  if (!db.deletedDistricts.includes(actualDistName)) {
    db.deletedDistricts.push(actualDistName);
  }

  // Clean up district products and dc rules
  if (db.districtProducts) {
    delete db.districtProducts[actualDistName];
    delete db.districtProducts[actualDistName.toLowerCase()];
    delete db.districtProducts[actualDistName.toUpperCase()];
  }
  if (db.dcRules) {
    delete db.dcRules[actualDistName];
    delete db.dcRules[actualDistName.toLowerCase()];
    delete db.dcRules[actualDistName.toUpperCase()];
    try {
      await pool.query('DELETE FROM dc_rules WHERE LOWER(district) = $1', [actualDistName.toLowerCase()]);
    } catch (e) {}
  }

  // Remove associated dealer user
  const deletedUsers = [];
  db.users = (db.users || []).filter(u => {
    if (u.role === 'dealer' && u.district && u.district.toLowerCase() === trimmedDist.toLowerCase()) {
      deletedUsers.push(u.id);
      return false;
    }
    return true;
  });

  for (const uid of deletedUsers) {
    try {
      await pool.query('DELETE FROM users WHERE id = $1', [uid]);
    } catch (e) {
      console.error('Postgres delete user error:', e.message);
    }
  }

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    actualDistName,
    'DISTRICT_DELETED',
    `Permanently deleted district "${actualDistName}" and removed associated dealer account`
  );

  await saveDb();

  res.json({
    message: `District "${actualDistName}" permanently deleted.`,
    district: actualDistName,
    activeDistricts: db.districts
  });
});

// 9. Activity logs with filters
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

// 10. Get District DC Rules
const { DEFAULT_DC_RULES, describeRule } = require('../utils/dcCalculator');
router.get('/dc-rules', (req, res) => {
  if (!db.dcRules || Object.keys(db.dcRules).length === 0) {
    db.dcRules = JSON.parse(JSON.stringify(DEFAULT_DC_RULES));
  }

  const activeDistricts = getDistricts();
  const list = activeDistricts.map(dist => {
    const rule = db.dcRules[dist] || DEFAULT_DC_RULES[dist] || { type: 'flat', value: 200 };
    return {
      district: dist,
      rule,
      description: describeRule(rule)
    };
  });

  res.json({ dcRules: list });
});

// 11. Admin: Update DC Rule for a District
router.post('/update-district-dc', authenticateToken, requireAdmin, async (req, res) => {
  const { district, rule } = req.body;
  if (!district || !rule) {
    return res.status(400).json({ error: 'district and rule configuration are required' });
  }

  if (!db.dcRules) db.dcRules = {};
  db.dcRules[district] = rule;

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'DC_RULE_UPDATE',
    `Updated DC rule for ${district}: ${describeRule(rule)}`
  );

  await saveDb();

  // Save to Neon PostgreSQL dc_rules table
  try {
    const rType = rule.type || 'flat';
    const rVal = (rType === 'flat') ? (Number(rule.value) || 200) : null;
    const rLe = (rType === 'threshold') ? (Number(rule.le) || 200) : null;
    const rGt = (rType === 'threshold') ? (Number(rule.gt) || 250) : null;
    const rThresh = (rType === 'threshold') ? (Number(rule.threshold) || 1500) : 1500;

    await pool.query(
      `INSERT INTO dc_rules (district, rule_type, rule_val, rule_le, rule_gt, threshold, overrides)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (district) DO UPDATE 
       SET rule_type = $2, rule_val = $3, rule_le = $4, rule_gt = $5, threshold = $6, overrides = $7`,
      [district, rType, rVal, rLe, rGt, rThresh, JSON.stringify(rule.overrides || {})]
    );
  } catch (pgErr) {
    console.error('Postgres dc_rules update error:', pgErr.message);
  }

  res.json({
    message: `DC rule updated for ${district}: ${describeRule(rule)}`,
    district,
    rule,
    description: describeRule(rule)
  });
});

module.exports = router;
