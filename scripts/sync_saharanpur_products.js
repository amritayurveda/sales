// scripts/sync_saharanpur_products.js
const { initDb, db, saveDb } = require('../config/db');
const { pool } = require('../config/postgres');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('🚀 Synchronizing Saharanpur district and setting ONLY the 4 requested products...');

  await initDb();

  // 1. Ensure Saharanpur is in db.districts
  if (!db.districts) db.districts = [];
  const existingSahIndex = db.districts.findIndex(d => d.toUpperCase() === 'SAHARANPUR');
  if (existingSahIndex !== -1) {
    db.districts[existingSahIndex] = 'Saharanpur';
  } else {
    db.districts.push('Saharanpur');
  }

  // 2. Ensure dealer account for Saharanpur exists in db.users & PostgreSQL users table
  if (!db.users) db.users = [];
  let sahDealer = db.users.find(u => u.district && u.district.toUpperCase() === 'SAHARANPUR');
  if (!sahDealer) {
    const salt = bcrypt.genSaltSync(10);
    const passHash = bcrypt.hashSync('dealer123', salt);
    sahDealer = {
      id: 'u_dealer_saharanpur',
      username: 'dealer_saharanpur',
      name: 'Saharanpur Dealer',
      passwordHash: passHash,
      role: 'dealer',
      district: 'Saharanpur',
      createdAt: new Date().toISOString()
    };
    db.users.push(sahDealer);
    console.log('  ✔ Created dealer_saharanpur user account');
  } else {
    sahDealer.district = 'Saharanpur';
    console.log(`  ✔ Found existing Saharanpur dealer user: ${sahDealer.username}`);
  }

  try {
    await pool.query(
      `INSERT INTO users (id, username, name, password_hash, role, district, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (username) DO UPDATE SET name = $3, district = $6`,
      [sahDealer.id, sahDealer.username, sahDealer.name, sahDealer.passwordHash, sahDealer.role, sahDealer.district, sahDealer.createdAt]
    );
  } catch (e) {
    console.error('Postgres user sync error:', e.message);
  }

  // 3. Set strictly the 4 products from the image:
  // 1. PLAY MORE
  // 2. FOUJI
  // 3. EYE SUTRA
  // 4. ALERGY
  const FOUR_PRODUCTS = [
    {
      id: 'dp_sah_1',
      productId: 'prod_pm',
      name: 'PLAY MORE',
      schemePrice: 2500,
      stockAllocated: 50,
      currentStock: 50,
      schemes: [{ id: 'sch_pm_1', name: 'PLAY MORE 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_sah_2',
      productId: 'prod_fj',
      name: 'FOUJI',
      schemePrice: 2500,
      stockAllocated: 10,
      currentStock: 10,
      schemes: [{ id: 'sch_fj_1', name: 'FOUJI 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_sah_3',
      productId: 'prod_es',
      name: 'EYE SUTRA',
      schemePrice: 2500,
      stockAllocated: 15,
      currentStock: 15,
      schemes: [{ id: 'sch_es_1', name: 'EYE SUTRA 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_sah_4',
      productId: 'prod_alg',
      name: 'ALERGY',
      schemePrice: 2500,
      stockAllocated: 12,
      currentStock: 12,
      schemes: [{ id: 'sch_alg_1', name: 'ALERGY 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    }
  ];

  if (!db.districtProducts) db.districtProducts = {};
  db.districtProducts['Saharanpur'] = FOUR_PRODUCTS;
  db.districtProducts['SAHARANPUR'] = FOUR_PRODUCTS;

  // 4. Set DC Rule for Saharanpur
  if (!db.dcRules) db.dcRules = {};
  db.dcRules['Saharanpur'] = { type: 'flat', value: 200 };
  db.dcRules['SAHARANPUR'] = { type: 'flat', value: 200 };

  // Save to Neon PostgreSQL
  await saveDb();

  console.log('✅ Saharanpur products successfully set to:');
  db.districtProducts['Saharanpur'].forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.name} (Stock: ${p.currentStock})`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
