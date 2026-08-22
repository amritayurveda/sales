// config/db.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { DEFAULT_DC_RULES } = require('../utils/dcCalculator');

const os = require('os');

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = isServerless ? path.join(os.tmpdir(), 'sales_data') : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

const DISTRICTS = [
  "Chittorgarh", "Alwar", "Bikaner", "Uttarakhand", "Udham Singh Nagar", "Jodhpur",
  "Kota", "Faridabad", "Gurgaon", "Rewari", "Muzaffarnagar", "Shamli"
];

// Product master list aligned with Excel report
const EXCEL_PRODUCTS = [
  { name: "DAMADAR", defaultStock: 8.1, schemes: [
    { id: "sch_dmd_1", name: "DMD 1", qty: 1, price: 3052, dc: 250 },
    { id: "sch_dmd_2", name: "DMD 2", qty: 2, price: 6104, dc: 500 },
    { id: "sch_dmd_3", name: "DMD 3", qty: 3, price: 9156, dc: 750 }
  ]},
  { name: "TONIC+FM", defaultStock: 0.1, schemes: [
    { id: "sch_tfm_1", name: "TONIC+FM 1", qty: 1, price: 2950, dc: 250 }
  ]},
  { name: "AMAR NETRAN", defaultStock: 11, schemes: [
    { id: "sch_an_1", name: "AMAR NETRAN 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "AAROGAYA NET", defaultStock: 17.7, schemes: [
    { id: "sch_ag_1", name: "AG (Aarogya Net 1)", qty: 1, price: 2500, dc: 250 },
    { id: "sch_ag_2", name: "AG (Aarogya Net 2)", qty: 2, price: 5000, dc: 500 }
  ]},
  { name: "KADWI DAWA", defaultStock: 7.0, schemes: [
    { id: "sch_kd_1", name: "KD 1", qty: 1, price: 2870, dc: 250 },
    { id: "sch_kd_2", name: "KD 2", qty: 2, price: 5740, dc: 500 }
  ]},
  { name: "HEIGH TONIC", defaultStock: 4.0, schemes: [
    { id: "sch_ht_1", name: "HT (Heigh Tonic 1)", qty: 1, price: 2950, dc: 250 },
    { id: "sch_ht_2", name: "HT (Heigh Tonic 2)", qty: 2, price: 5900, dc: 500 }
  ]},
  { name: "SUPRAGUT", defaultStock: 0, schemes: [
    { id: "sch_sg_1", name: "SUPRAGUT 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "RAJ VILLA", defaultStock: 2.4, schemes: [
    { id: "sch_rv_1", name: "RAJ VILLA 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "MONEY+HCY", defaultStock: 4.1, schemes: [
    { id: "sch_mh_1", name: "MONEY+HCY 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "PV", defaultStock: 2, schemes: [
    { id: "sch_pv_1", name: "PV 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "DS", defaultStock: 6, schemes: [
    { id: "sch_ds_1", name: "DS (Height Sutra 1)", qty: 1, price: 3580, dc: 250 },
    { id: "sch_ds_2", name: "DS (Height Sutra 2)", qty: 2, price: 7160, dc: 500 }
  ]},
  { name: "UDAR", defaultStock: 0, schemes: [
    { id: "sch_udar_1", name: "UDAR 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "GUT", defaultStock: 0, schemes: [
    { id: "sch_gut_1", name: "GUT 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "TSO", defaultStock: 0, schemes: [
    { id: "sch_tso_1", name: "TSO 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "PILES BASAM", defaultStock: 0, schemes: [
    { id: "sch_pb_1", name: "PILES BASAM 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "ALCO BAN", defaultStock: 2, schemes: [
    { id: "sch_ab_1", name: "ALCO BAN 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "RSO", defaultStock: 12.1, schemes: [
    { id: "sch_rso_1", name: "RSO 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "MANI RARTAN", defaultStock: 6, schemes: [
    { id: "sch_mr_1", name: "MANI RARTAN 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "NONI 500 ML", defaultStock: 7, schemes: [
    { id: "sch_noni_1", name: "NONI 500 ML 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "PLAY MORE", defaultStock: 50, schemes: [
    { id: "sch_pm_1", name: "PLAY MORE 1", qty: 1, price: 2500, dc: 170 }
  ]},
  { name: "FOUJI", defaultStock: 10, schemes: [
    { id: "sch_fj_1", name: "FOUJI 1", qty: 1, price: 2500, dc: 170 }
  ]},
  { name: "EYE SUTRA", defaultStock: 15, schemes: [
    { id: "sch_es_1", name: "EYE SUTRA 1", qty: 1, price: 2500, dc: 170 }
  ]},
  { name: "ALERGY", defaultStock: 12, schemes: [
    { id: "sch_alg_1", name: "ALERGY 1", qty: 1, price: 2500, dc: 170 }
  ]}
];

const DISTRICT_SLUGS = {
  "Chittorgarh": "dealer_chittorgarh",
  "Alwar": "dealer_alwar",
  "Bikaner": "dealer_bikaner",
  "Uttarakhand": "dealer_uttarakhand",
  "Udham Singh Nagar": "dealer_udhamsingh",
  "Jodhpur": "dealer_jodhpur",
  "Kota": "dealer_kota",
  "Faridabad": "dealer_faridabad",
  "Gurgaon": "dealer_gurgaon",
  "Rewari": "dealer_rewari",
  "Muzaffarnagar": "dealer_muzaffarnagar",
  "Shamli": "dealer_shamli"
};

const { pool, initPostgresTables } = require('./postgres');

let db = {
  districts: [...DISTRICTS],
  users: [],
  products: [],
  districtProducts: {},
  dcRules: {},
  customerOrders: [],
  inventoryLogs: [],
  cashSettlements: [],
  milaStock: {},
  inwardNotes: {},
  baseOpeningCash: {},
  sales: {},
  ledgers: {},
  activityLogs: [],
  googleSheetsConfig: {},
  stockTransfers: []
};

function getDistricts() {
  if (db.districts && Array.isArray(db.districts) && db.districts.length > 0) {
    return db.districts;
  }
  return DISTRICTS;
}

async function saveDb() {
  // 1. Try local file write in safe try/catch (won't crash or block Postgres on Vercel)
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = DB_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tempFile, DB_FILE);
  } catch (fsErr) {
    // Read-only filesystem on Vercel is expected - continue to Postgres
  }

  // 2. Persist to Neon PostgreSQL Database (Always executed & awaited)
  try {
    await pool.query(
      `INSERT INTO app_state (key, value, updated_at) VALUES ('main_state', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(db)]
    );
  } catch (pgErr) {
    console.error('Neon PostgreSQL saveDb error:', pgErr.message);
  }
}

function logActivity(userId, username, role, district, action, details) {
  const entry = {
    id: 'act_' + Date.now() + Math.random().toString(36).slice(2, 6),
    userId,
    username,
    role,
    district: district || null,
    action,
    details: typeof details === 'string' ? details : JSON.stringify(details),
    timestamp: new Date().toISOString()
  };

  if (!db.activityLogs) db.activityLogs = [];
  db.activityLogs.unshift(entry);

  if (db.activityLogs.length > 1000) {
    db.activityLogs = db.activityLogs.slice(0, 1000);
  }

  // Insert to Neon PostgreSQL activity_logs table
  pool.query(
    `INSERT INTO activity_logs (id, user_id, username, role, district, action, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entry.id, entry.userId, entry.username, entry.role, entry.district, entry.action, entry.details, entry.timestamp]
  ).catch(err => console.error('Neon PostgreSQL log activity error:', err.message));

  saveDb();
  return entry;
}

// Synchronous baseline load
function loadLocalDatabase() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      const loaded = JSON.parse(content);
      Object.keys(db).forEach(k => delete db[k]);
      Object.assign(db, loaded);
      if (!db.districtProducts) db.districtProducts = {};
      if (!db.customerOrders) db.customerOrders = [];
      if (!db.inventoryLogs) db.inventoryLogs = [];
      if (!db.cashSettlements) db.cashSettlements = [];
      if (!db.milaStock) db.milaStock = {};
      if (!db.inwardNotes) db.inwardNotes = {};
      if (!db.baseOpeningCash) db.baseOpeningCash = {};
      if (!db.activityLogs) db.activityLogs = [];
      if (!db.dcRules || Object.keys(db.dcRules).length === 0) {
        db.dcRules = JSON.parse(JSON.stringify(DEFAULT_DC_RULES));
      }
      if (!db.districts || !Array.isArray(db.districts) || db.districts.length === 0) {
        db.districts = [...DISTRICTS];
      }
      ensureDistrictSchemes();
    } catch (e) {
      seedInitialData();
    }
  } else {
    seedInitialData();
  }
}

// Initial baseline load
loadLocalDatabase();

async function initDb() {
  try {
    // 1. Initialize PostgreSQL tables on Neon Tech
    await initPostgresTables();

    // 2. Try loading from Neon PostgreSQL app_state
    const pgRes = await pool.query("SELECT value FROM app_state WHERE key = 'main_state' LIMIT 1");
    if (pgRes.rows.length > 0 && pgRes.rows[0].value) {
      const loaded = typeof pgRes.rows[0].value === 'string' ? JSON.parse(pgRes.rows[0].value) : pgRes.rows[0].value;
      if (loaded && loaded.users && loaded.users.length > 0) {
        Object.keys(db).forEach(k => delete db[k]);
        Object.assign(db, loaded);
        console.log('✅ Loaded data successfully from Neon PostgreSQL database!');
      }
    } else {
      // If Postgres was empty, push baseline state to Postgres
      await saveDb();
      console.log('✅ Initialized & Synced clean state to Neon PostgreSQL!');
    }

    // 3. Load all customer_orders from Postgres customer_orders table and merge to guarantee zero data loss
    try {
      const ordersRes = await pool.query("SELECT * FROM customer_orders ORDER BY created_at DESC");
      if (ordersRes.rows && ordersRes.rows.length > 0) {
        if (!db.customerOrders) db.customerOrders = [];
        const orderMap = new Map();
        ordersRes.rows.forEach(r => {
          let dateStr = '';
          if (r.order_date instanceof Date) {
            const yr = r.order_date.getFullYear();
            const mo = String(r.order_date.getMonth() + 1).padStart(2, '0');
            const dy = String(r.order_date.getDate()).padStart(2, '0');
            dateStr = `${yr}-${mo}-${dy}`;
          } else if (typeof r.order_date === 'string') {
            dateStr = r.order_date.slice(0, 10);
          }

          orderMap.set(r.id, {
            id: r.id,
            orderNo: r.order_no,
            district: r.district,
            date: dateStr,
            time: r.order_time,
            productId: r.product_id,
            productName: r.product_name,
            schemeName: `${r.product_name} (₹${Number(r.unit_price).toLocaleString('en-IN')})`,
            qty: Number(r.qty) || 1,
            unitPrice: Number(r.unit_price) || 0,
            dcRate: Number(r.dc_rate) || 0,
            totalAmount: (Number(r.qty) || 1) * (Number(r.unit_price) || 0),
            netAmount: Number(r.net_amount) || 0,
            customerMobile: r.customer_mobile,
            customerName: r.customer_name,
            note: r.note || '',
            dealerUsername: r.dealer_username,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
          });
        });
        db.customerOrders.forEach(o => {
          if (!orderMap.has(o.id)) orderMap.set(o.id, o);
        });
        db.customerOrders = Array.from(orderMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
    } catch (orderErr) {
      console.error('Neon PostgreSQL customer_orders load error:', orderErr.message);
    }

    // 4. Load stock_transfers from PostgreSQL and merge
    try {
      const xfersRes = await pool.query("SELECT * FROM stock_transfers ORDER BY dispatched_at DESC");
      if (xfersRes.rows && xfersRes.rows.length > 0) {
        if (!db.stockTransfers) db.stockTransfers = [];
        const xferMap = new Map();
        xfersRes.rows.forEach(r => {
          xferMap.set(r.id, {
            id: r.id,
            transferNo: r.transfer_no,
            district: r.district,
            productId: r.product_id,
            productName: r.product_name,
            qty: Number(r.qty) || 0,
            items: r.items ? (typeof r.items === 'string' ? JSON.parse(r.items) : r.items) : [],
            totalUnits: Number(r.total_units) || Number(r.qty) || 0,
            status: r.status || 'PENDING_ACCEPTANCE',
            challanNo: r.challan_no || '',
            note: r.note || '',
            dispatchedBy: r.dispatched_by,
            dispatchedAt: r.dispatched_at ? new Date(r.dispatched_at).toISOString() : new Date().toISOString(),
            receivedBy: r.received_by || null,
            receivedAt: r.received_at ? new Date(r.received_at).toISOString() : null,
            receivedDate: r.received_date ? (r.received_date instanceof Date ? `${r.received_date.getFullYear()}-${String(r.received_date.getMonth()+1).padStart(2,'0')}-${String(r.received_date.getDate()).padStart(2,'0')}` : String(r.received_date).slice(0,10)) : null,
            declinedBy: r.declined_by || null,
            declinedAt: r.declined_at ? new Date(r.declined_at).toISOString() : null,
            declineReason: r.decline_reason || null
          });
        });
        db.stockTransfers.forEach(t => {
          if (!xferMap.has(t.id)) xferMap.set(t.id, t);
        });
        db.stockTransfers = Array.from(xferMap.values()).sort((a, b) => new Date(b.dispatchedAt) - new Date(a.dispatchedAt));
      }
    } catch (xferErr) {
      console.error('Neon PostgreSQL stock_transfers load error:', xferErr.message);
    }

    // 5. Load cash_settlements from PostgreSQL and merge
    try {
      const cashRes = await pool.query("SELECT * FROM cash_settlements ORDER BY created_at DESC");
      if (cashRes.rows && cashRes.rows.length > 0) {
        if (!db.cashSettlements) db.cashSettlements = [];
        const cashMap = new Map();
        cashRes.rows.forEach(r => {
          let pDate = '';
          if (r.payment_date instanceof Date) {
            const yr = r.payment_date.getFullYear();
            const mo = String(r.payment_date.getMonth() + 1).padStart(2, '0');
            const dy = String(r.payment_date.getDate()).padStart(2, '0');
            pDate = `${yr}-${mo}-${dy}`;
          } else if (typeof r.payment_date === 'string') {
            pDate = r.payment_date.slice(0, 10);
          }

          cashMap.set(r.id, {
            id: r.id,
            receiptNo: r.receipt_no,
            district: r.district,
            date: pDate,
            amount: Number(r.amount) || 0,
            paymentMode: r.payment_mode || 'Cash Deposit',
            note: r.note || '',
            receivedBy: r.received_by,
            createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
          });
        });
        db.cashSettlements.forEach(s => {
          if (!cashMap.has(s.id)) cashMap.set(s.id, s);
        });
        db.cashSettlements = Array.from(cashMap.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
    } catch (cashErr) {
      console.error('Neon PostgreSQL cash_settlements load error:', cashErr.message);
    }

    // 6. Load dc_rules from PostgreSQL and merge
    try {
      const dcRes = await pool.query("SELECT * FROM dc_rules");
      if (dcRes.rows && dcRes.rows.length > 0) {
        if (!db.dcRules) db.dcRules = {};
        dcRes.rows.forEach(r => {
          if (r.rule_type === 'flat') {
            db.dcRules[r.district] = {
              type: 'flat',
              value: Number(r.rule_val) || 200,
              overrides: r.overrides || {}
            };
          } else if (r.rule_type === 'threshold') {
            db.dcRules[r.district] = {
              type: 'threshold',
              threshold: Number(r.threshold) || 1500,
              le: Number(r.rule_le) || 200,
              gt: Number(r.rule_gt) || 250,
              overrides: r.overrides || {}
            };
          }
        });
      }
    } catch (dcErr) {
      console.error('Neon PostgreSQL dc_rules load error:', dcErr.message);
    }

    if (!db.districts || !Array.isArray(db.districts) || db.districts.length === 0) {
      db.districts = [...DISTRICTS];
    }
    if (!db.customerOrders) db.customerOrders = [];
    if (!db.stockTransfers) db.stockTransfers = [];
    if (!db.districtProducts) db.districtProducts = {};
    ensureDistrictSchemes();
  } catch (err) {
    console.error('Neon PostgreSQL initialization check warning:', err.message);
  }

  return db;
}

function ensureDistrictSchemes() {
  const activeDistricts = getDistricts();
  activeDistricts.forEach(dist => {
    if (!db.districtProducts[dist] || db.districtProducts[dist].length === 0) {
      db.districtProducts[dist] = EXCEL_PRODUCTS.map((p, idx) => ({
        id: `dp_${dist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3)}_p${idx + 1}`,
        productId: `prod_${idx + 1}`,
        name: p.name,
        schemePrice: p.schemes[0].price,
        stockAllocated: p.defaultStock,
        currentStock: p.defaultStock,
        schemes: JSON.parse(JSON.stringify(p.schemes)),
        isActive: true
      }));
    } else {
      // Ensure each product has schemes array
      db.districtProducts[dist].forEach(p => {
        if (!p.schemes || p.schemes.length === 0) {
          const match = EXCEL_PRODUCTS.find(ep => ep.name.toLowerCase() === p.name.toLowerCase());
          p.schemes = match ? JSON.parse(JSON.stringify(match.schemes)) : [
            { id: `sch_${p.productId}_1`, name: `${p.name} Standard`, qty: 1, price: p.schemePrice || 2500, dc: 250 }
          ];
        }
      });
    }
  });
}

function seedInitialData() {
  const salt = bcrypt.genSaltSync(10);
  const defaultDealerPasswordHash = bcrypt.hashSync('dealer123', salt);
  const defaultAdminPasswordHash = bcrypt.hashSync('admin123', salt);

  // 1. Users
  const users = [
    {
      id: 'u_admin',
      username: 'admin',
      name: 'System Administrator',
      passwordHash: defaultAdminPasswordHash,
      role: 'admin',
      district: null,
      createdAt: new Date().toISOString()
    }
  ];

  DISTRICTS.forEach((dist, idx) => {
    const slug = DISTRICT_SLUGS[dist] || `dealer_${dist.toLowerCase().replace(/\s+/g, '')}`;
    users.push({
      id: `u_dealer_${idx + 1}`,
      username: slug,
      name: `${dist} Dealer`,
      passwordHash: defaultDealerPasswordHash,
      role: 'dealer',
      district: dist,
      createdAt: new Date().toISOString()
    });
  });

  // 2. Global Products Master from master_catalog.json
  const masterCatalogPath = path.join(DATA_DIR, 'master_catalog.json');
  let products = [];
  if (fs.existsSync(masterCatalogPath)) {
    try {
      products = JSON.parse(fs.readFileSync(masterCatalogPath, 'utf8'));
    } catch (e) {
      console.error('Error reading master_catalog.json:', e);
    }
  }

  if (!products || products.length === 0) {
    products = EXCEL_PRODUCTS.map((p, idx) => ({
      id: `prod_${idx + 1}`,
      name: p.name,
      defaultPrice: p.schemes[0].price,
      schemes: JSON.parse(JSON.stringify(p.schemes)),
      isActive: true,
      sortOrder: idx + 1
    }));
  }

  // 3. District Products with ALL STOCK = 0
  const districtProducts = {};
  DISTRICTS.forEach(dist => {
    districtProducts[dist] = products.map((p, idx) => ({
      id: `dp_${dist.toLowerCase().slice(0, 3)}_p${idx + 1}`,
      productId: p.id,
      name: p.name,
      stockAllocated: 0,
      currentStock: 0,
      isActive: true
    }));
  });

  // 4. DC Rules
  const dcRules = JSON.parse(JSON.stringify(DEFAULT_DC_RULES));

  // 5. Clean Empty State (0 Cash, 0 Stock, 0 Fake Details)
  const baseOpeningCash = {};
  const milaStock = {};
  const inwardNotes = {};
  const customerOrders = [];
  const cashSettlements = [];
  const sales = {};
  const ledgers = {};
  const activityLogs = [];
  Object.keys(db).forEach(k => delete db[k]);
  Object.assign(db, {
    users,
    products,
    districtProducts,
    dcRules,
    customerOrders,
    inventoryLogs: [],
    cashSettlements,
    milaStock,
    inwardNotes,
    baseOpeningCash,
    sales,
    ledgers,
    activityLogs
  });

  saveDb();
  console.log('Database successfully initialized in 100% clean state (0 cash, 0 stock).');
}

module.exports = {
  db,
  DISTRICTS,
  getDistricts,
  DISTRICT_SLUGS,
  EXCEL_PRODUCTS,
  initDb,
  saveDb,
  logActivity
};
