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
  "Kota", "Faridabad", "Gurgaon", "Muzaffarnagar", "Saharanpur"
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
  { name: "ALCO BAN", defaultStock: 0, schemes: [
    { id: "sch_ab_1", name: "ALCO BAN 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "RSO", defaultStock: 0, schemes: [
    { id: "sch_rso_1", name: "RSO 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "MANI RARTAN", defaultStock: 0, schemes: [
    { id: "sch_mr_1", name: "MANI RARTAN 1", qty: 1, price: 2500, dc: 250 }
  ]},
  { name: "NONI 500 ML", defaultStock: 0, schemes: [
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

const SAHARANPUR_PRODUCTS = [
  { name: "PLAY MORE", defaultStock: 50, schemes: [{ id: "sch_pm_1", name: "PLAY MORE 1", qty: 1, price: 2500, dc: 170 }] },
  { name: "FOUJI", defaultStock: 10, schemes: [{ id: "sch_fj_1", name: "FOUJI 1", qty: 1, price: 2500, dc: 170 }] },
  { name: "EYE SUTRA", defaultStock: 15, schemes: [{ id: "sch_es_1", name: "EYE SUTRA 1", qty: 1, price: 2500, dc: 170 }] },
  { name: "ALERGY", defaultStock: 12, schemes: [{ id: "sch_alg_1", name: "ALERGY 1", qty: 1, price: 2500, dc: 170 }] }
];

const GURGAON_PRODUCTS = [
  { name: "AMAR NETRAN", defaultStock: 11, schemes: [{ id: "sch_an_1", name: "AMAR NETRAN 1", qty: 1, price: 2500, dc: 250 }] },
  { name: "KADWI DAWA", defaultStock: 7.0, schemes: [
    { id: "sch_kd_1", name: "KD 1", qty: 1, price: 2870, dc: 250 },
    { id: "sch_kd_2", name: "KD 2", qty: 2, price: 5740, dc: 500 }
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
  activityLogs: [],
  deletedDistricts: ['Rewari', 'Shamli'],
  mainWarehouseStock: {},
  mainStockInwardLogs: []
};

function getDistricts() {
  const all = (db.districts && Array.isArray(db.districts) && db.districts.length > 0) ? db.districts : DISTRICTS;
  const deleted = db.deletedDistricts || [];
  return all.filter(d => !deleted.some(dd => dd.toLowerCase() === d.toLowerCase()));
}

const ALL_ZERO_DISTRICTS = ['CHITTORGARH', 'ALWAR', 'BIKANER', 'UTTARAKHAND', 'UDHAM SINGH NAGAR'];

function normalizeDistrictName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const match = DISTRICTS.find(d => d.toLowerCase() === lower);
  if (match) return match;
  return trimmed.replace(/\b\w/g, l => l.toUpperCase());
}

function ensureDistrictSchemes() {
  if (!db.districtProducts) db.districtProducts = {};
  if (!db.customStockLocks) db.customStockLocks = {};

  const masterList = (db.products && db.products.length > 0) ? db.products : EXCEL_PRODUCTS.map((p, idx) => ({
    id: `prod_${idx + 1}`,
    name: p.name,
    isSpecial: ['PLAY MORE', 'FOUJI', 'EYE SUTRA', 'ALERGY'].includes(p.name.toUpperCase()),
    defaultPrice: p.schemes[0].price,
    schemes: p.schemes,
    isActive: true
  }));

  // Consolidate all district keys to canonical Title Case names
  const normalizedDistrictProducts = {};
  Object.keys(db.districtProducts).forEach(rawDist => {
    const canonical = normalizeDistrictName(rawDist);
    if (!canonical) return;

    if (!normalizedDistrictProducts[canonical]) {
      normalizedDistrictProducts[canonical] = [];
    }

    const items = db.districtProducts[rawDist];
    if (Array.isArray(items)) {
      items.forEach(it => {
        const master = masterList.find(m => m.id === it.productId || m.name.toUpperCase() === (it.name || '').toUpperCase());
        const cId = master ? master.id : it.productId;
        const cName = master ? master.name : it.name;

        const existingIdx = normalizedDistrictProducts[canonical].findIndex(p => p.productId === cId || p.name.toUpperCase() === cName.toUpperCase());
        const stockAlloc = Number(it.stockAllocated) || 0;
        const currStock = Number(it.currentStock) || stockAlloc;
        const isLocked = Boolean(it.isCustomStockLocked);

        if (existingIdx === -1) {
          normalizedDistrictProducts[canonical].push({
            id: it.id || `dp_${canonical.toLowerCase().slice(0, 3)}_${cId}`,
            productId: cId,
            name: cName,
            isSpecial: master ? Boolean(master.isSpecial) : Boolean(it.isSpecial),
            schemePrice: master ? ((master.schemes && master.schemes[0]) ? master.schemes[0].price : master.defaultPrice) : (it.schemePrice || 2500),
            stockAllocated: stockAlloc,
            currentStock: currStock,
            schemes: (master && master.schemes) ? JSON.parse(JSON.stringify(master.schemes)) : (it.schemes || []),
            isActive: it.isActive !== false,
            isCustomStockLocked: isLocked
          });
        } else {
          // If duplicate entry, merge preserving locked stock or non-zero stock
          const existing = normalizedDistrictProducts[canonical][existingIdx];
          if (isLocked || (!existing.isCustomStockLocked && stockAlloc > 0)) {
            existing.stockAllocated = stockAlloc;
            existing.currentStock = currStock;
            existing.isCustomStockLocked = isLocked;
          }
        }
      });
    }
  });

  db.districtProducts = normalizedDistrictProducts;

  const activeDistricts = getDistricts();

  activeDistricts.forEach(dist => {
    const canonical = normalizeDistrictName(dist);
    const pfx = canonical.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3);
    const uDist = canonical.toUpperCase();

    if (!db.districtProducts[canonical] || db.districtProducts[canonical].length === 0) {
      if (uDist === 'SAHARANPUR' || uDist === 'MUZAFFARNAGAR') {
        db.districtProducts[canonical] = SAHARANPUR_PRODUCTS.map(sp => {
          const master = masterList.find(m => m.name.toUpperCase() === sp.name.toUpperCase());
          const mId = master ? master.id : `prod_${pfx}_1`;
          return {
            id: `dp_${pfx}_${mId}`,
            productId: mId,
            name: sp.name,
            isSpecial: true,
            schemePrice: sp.schemes[0].price,
            stockAllocated: sp.defaultStock,
            currentStock: sp.defaultStock,
            schemes: JSON.parse(JSON.stringify(sp.schemes)),
            isActive: true
          };
        });
      } else if (uDist === 'GURGAON' || uDist === 'FARIDABAD') {
        db.districtProducts[canonical] = GURGAON_PRODUCTS.map(gp => {
          const master = masterList.find(m => m.name.toUpperCase() === gp.name.toUpperCase());
          const mId = master ? master.id : `prod_${pfx}_1`;
          return {
            id: `dp_${pfx}_${mId}`,
            productId: mId,
            name: gp.name,
            isSpecial: false,
            schemePrice: gp.schemes[0].price,
            stockAllocated: gp.defaultStock,
            currentStock: gp.defaultStock,
            schemes: JSON.parse(JSON.stringify(gp.schemes)),
            isActive: true
          };
        });
      } else if (ALL_ZERO_DISTRICTS.includes(uDist)) {
        db.districtProducts[canonical] = masterList.map(p => ({
          id: `dp_${pfx}_${p.id}`,
          productId: p.id,
          name: p.name,
          isSpecial: Boolean(p.isSpecial),
          schemePrice: (p.schemes && p.schemes[0]) ? p.schemes[0].price : 2500,
          stockAllocated: 0,
          currentStock: 0,
          schemes: JSON.parse(JSON.stringify(p.schemes || [])),
          isActive: true
        }));
      } else {
        db.districtProducts[canonical] = [];
      }
    }

    // Apply any explicit custom stock locks to the district products
    if (Array.isArray(db.districtProducts[canonical])) {
      db.districtProducts[canonical].forEach(p => {
        const lockKey1 = `${canonical}:${p.productId}`;
        const lockKey2 = `${canonical.toLowerCase()}:${p.productId}`;
        if (db.customStockLocks[lockKey1] !== undefined) {
          const val = Number(db.customStockLocks[lockKey1]);
          p.stockAllocated = val;
          p.currentStock = val;
          p.isCustomStockLocked = true;
        } else if (db.customStockLocks[lockKey2] !== undefined) {
          const val = Number(db.customStockLocks[lockKey2]);
          p.stockAllocated = val;
          p.currentStock = val;
          p.isCustomStockLocked = true;
        }
      });
    }
  });
}

function seedInitialData() {
  const salt = bcrypt.genSaltSync(10);
  const defaultDealerPasswordHash = bcrypt.hashSync('dealer123', salt);
  const defaultAdminPasswordHash = bcrypt.hashSync('admin123', salt);

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

  const products = EXCEL_PRODUCTS.map((p, idx) => ({
    id: `prod_${idx + 1}`,
    name: p.name,
    isSpecial: ['PLAY MORE', 'FOUJI', 'EYE SUTRA', 'ALERGY'].includes(p.name.toUpperCase()),
    defaultPrice: p.schemes[0].price,
    schemes: JSON.parse(JSON.stringify(p.schemes)),
    isActive: true,
    sortOrder: idx + 1
  }));

  const districtProducts = {};
  DISTRICTS.forEach(dist => {
    const uDist = dist.toUpperCase();
    if (uDist === 'SAHARANPUR' || uDist === 'MUZAFFARNAGAR') {
      const pfx = dist.toLowerCase().slice(0, 3);
      districtProducts[dist] = SAHARANPUR_PRODUCTS.map((sp, idx) => ({
        id: `dp_${pfx}_${idx + 1}`,
        productId: `prod_${pfx}_${idx + 1}`,
        name: sp.name,
        isSpecial: true,
        schemePrice: sp.schemes[0].price,
        stockAllocated: sp.defaultStock,
        currentStock: sp.defaultStock,
        schemes: JSON.parse(JSON.stringify(sp.schemes)),
        isActive: true
      }));
    } else if (uDist === 'GURGAON' || uDist === 'FARIDABAD') {
      const pfx = dist.toLowerCase().slice(0, 3);
      districtProducts[dist] = GURGAON_PRODUCTS.map((gp, idx) => ({
        id: `dp_${pfx}_${idx + 1}`,
        productId: `prod_${pfx}_${idx + 1}`,
        name: gp.name,
        isSpecial: false,
        schemePrice: gp.schemes[0].price,
        stockAllocated: gp.defaultStock,
        currentStock: gp.defaultStock,
        schemes: JSON.parse(JSON.stringify(gp.schemes)),
        isActive: true
      }));
    } else if (ALL_ZERO_DISTRICTS.includes(uDist)) {
      const pfx = dist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3);
      districtProducts[dist] = EXCEL_PRODUCTS.map((p, idx) => ({
        id: `dp_${pfx}_p${idx + 1}`,
        productId: `prod_${idx + 1}`,
        name: p.name,
        isSpecial: ['PLAY MORE', 'FOUJI', 'EYE SUTRA', 'ALERGY'].includes(p.name.toUpperCase()),
        schemePrice: p.schemes[0].price,
        stockAllocated: 0,
        currentStock: 0,
        schemes: JSON.parse(JSON.stringify(p.schemes)),
        isActive: true
      }));
    } else {
      districtProducts[dist] = [];
    }
  });

  const dcRules = JSON.parse(JSON.stringify(DEFAULT_DC_RULES));
  const baseOpeningCash = {};
  const milaStock = {};
  const inwardNotes = {};
  const customerOrders = [];
  const cashSettlements = [];
  const activityLogs = [];

  Object.keys(db).forEach(k => delete db[k]);
  Object.assign(db, {
    users,
    products,
    districtProducts,
    dcRules,
    districts: [...DISTRICTS],
    baseOpeningCash,
    milaStock,
    inwardNotes,
    customerOrders,
    cashSettlements,
    activityLogs,
    deletedDistricts: ['Rewari', 'Shamli']
  });

  saveLocalDatabase();
}

function saveLocalDatabase() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    // Read-only filesystem is safe
  }
}

async function saveDb() {
  saveLocalDatabase();
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

  pool.query(
    `INSERT INTO activity_logs (id, user_id, username, role, district, action, details, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [entry.id, entry.userId, entry.username, entry.role, entry.district, entry.action, entry.details, entry.timestamp]
  ).catch(err => console.error('Neon PostgreSQL log activity error:', err.message));

  saveDb();
  return entry;
}

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
      if (!db.mainWarehouseStock) db.mainWarehouseStock = {};
      if (!db.mainStockInwardLogs) db.mainStockInwardLogs = [];
      if (!db.deletedDistricts) db.deletedDistricts = ['Rewari', 'Shamli'];
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
    // 1. Always verify and initialize tables in PostgreSQL
    await initPostgresTables();

    // 2. Load latest state from PostgreSQL
    const pgRes = await pool.query("SELECT value FROM app_state WHERE key = 'main_state' LIMIT 1");
    if (pgRes.rows.length > 0 && pgRes.rows[0].value) {
      const loaded = typeof pgRes.rows[0].value === 'string' ? JSON.parse(pgRes.rows[0].value) : pgRes.rows[0].value;
      if (loaded && loaded.users && loaded.users.length > 0) {
        Object.keys(db).forEach(k => delete db[k]);
        Object.assign(db, loaded);
        console.log('✅ Loaded data successfully from Neon PostgreSQL database!');
      }
    } else {
      await saveDb();
      console.log('✅ Initialized & Synced clean state to Neon PostgreSQL!');
    }

    if (!db.deletedDistricts) db.deletedDistricts = ['Rewari', 'Shamli'];
    if (!db.districts || !Array.isArray(db.districts) || db.districts.length === 0) {
      db.districts = [...DISTRICTS];
    }
    db.districts = db.districts.filter(d => !db.deletedDistricts.some(dd => dd.toLowerCase() === d.toLowerCase()));

    if (db.users && Array.isArray(db.users)) {
      db.users = db.users.filter(u => !u.district || !db.deletedDistricts.some(dd => dd.toLowerCase() === u.district.toLowerCase()));
    }

    if (!db.customerOrders) db.customerOrders = [];
    if (!db.stockTransfers) db.stockTransfers = [];
    if (!db.districtProducts) db.districtProducts = {};
    if (!db.mainWarehouseStock) db.mainWarehouseStock = {};
    if (!db.mainStockInwardLogs) db.mainStockInwardLogs = [];
    if (!db.customStockLocks) db.customStockLocks = {};

    ensureDistrictSchemes();
    await saveDb();
  } catch (err) {
    console.error('Neon PostgreSQL initialization check warning:', err.message);
  }

  return db;
}

module.exports = {
  db,
  saveDb,
  initDb,
  logActivity,
  DISTRICTS,
  getDistricts,
  EXCEL_PRODUCTS,
  DISTRICT_SLUGS,
  DEFAULT_DC_RULES
};
