// scripts/reset_clean_database.js
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { DEFAULT_DC_RULES } = require('../utils/dcCalculator');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

const DISTRICTS = [
  "Chittorgarh", "Alwar", "Bikaner", "Uttarakhand", "Udham Singh Nagar", "Jodhpur",
  "Kota", "Faridabad", "Gurgaon", "Rewari", "Muzaffarnagar", "Shamli"
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

// Generate fresh clean database
const salt = bcrypt.genSaltSync(10);
const defaultDealerPasswordHash = bcrypt.hashSync('dealer123', salt);
const defaultAdminPasswordHash = bcrypt.hashSync('admin123', salt);

// 1. Clean Users
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

// 2. Read existing products from master_catalog.json or database.json
let products = [];
const masterCatalogPath = path.join(DATA_DIR, 'master_catalog.json');
if (fs.existsSync(masterCatalogPath)) {
  try {
    products = JSON.parse(fs.readFileSync(masterCatalogPath, 'utf8')).map(p => ({
      id: p.id,
      name: p.name,
      isActive: true
    }));
  } catch (e) {
    console.error('Error reading master_catalog.json:', e);
  }
}

if (fs.existsSync(DB_FILE)) {
  try {
    const existingDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (existingDb.products && existingDb.products.length > 0) {
      products = existingDb.products.map(p => ({
        id: p.id,
        name: p.name,
        isActive: true
      }));
    }
  } catch (e) {}
}

// Ensure special products exist
const requiredProducts = [
  'DAMADAR OIL', 'PEEDA BHASM', 'PILES BHASM', 'RSO RARE SLIMMING OIL', 'AAROGYA NETRAM',
  'HANUMAN CHALISA YANTRA', 'GUT AROGYA', 'ZERO ADDICTION', 'ALCOBAN PLUS', 'DRINK STOP',
  'CURE VISION', 'UDAR SANJIVANI', 'TSO (TRIBAL SLIMMING OIL)', 'TRIBAL BLACK HAIR OIL',
  'RAJVILAS', 'HARJOD', 'MONEY RATNAM', 'EVERESTER', 'SLIMTONIC', 'SWARN VILAS',
  'NONI D CARE', 'PUSHTIVARDHNAM', 'HIGHTONIC', 'SANDHI SUDHA', 'KALA GHODA',
  'PLAY MORE', 'HEIGHT VEDA', 'ALERGY SAFA', 'EYE SUTRA'
];

requiredProducts.forEach(reqName => {
  if (!products.some(p => p.name.toUpperCase() === reqName.toUpperCase())) {
    products.push({
      id: 'prod_' + (products.length + 1),
      name: reqName,
      isActive: true
    });
  }
});

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

// 4. Clean DC Rules
const dcRules = JSON.parse(JSON.stringify(DEFAULT_DC_RULES));

const cleanDb = {
  users,
  products,
  districtProducts,
  dcRules,
  baseOpeningCash: {},   // ALL DISTRICTS CASH = 0
  milaStock: {},         // ALL MILA INWARD = 0
  inwardNotes: {},       // NO FAKE NOTES
  customerOrders: [],    // ZERO SALES ORDERS
  cashSettlements: [],   // ZERO FAKE SETTLEMENTS
  sales: {},             // ZERO SALES
  ledgers: {},           // ZERO FAKE LEDGERS
  activityLogs: []       // CLEAN LOGS
};

fs.writeFileSync(DB_FILE, JSON.stringify(cleanDb, null, 2), 'utf8');
console.log('✅ DATABASE RESET TO 100% CLEAN STATE:');
console.log(`- ${users.length} Users initialized (Admin + 12 Dealers)`);
console.log(`- ${products.length} Master Products active`);
console.log(`- 12 Districts configured with Stock = 0 units`);
console.log(`- Opening Cash = ₹0 for all districts`);
console.log(`- 0 Sales, 0 Orders, 0 Cash settlements`);
