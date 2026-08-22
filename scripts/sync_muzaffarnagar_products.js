// scripts/sync_muzaffarnagar_products.js
const { initDb, db, saveDb } = require('../config/db');

async function main() {
  console.log('🚀 Synchronizing Muzaffarnagar to strictly the 4 products (same as Saharanpur)...');

  await initDb();

  const FOUR_PRODUCTS = [
    {
      id: 'dp_muz_1',
      productId: 'prod_pm',
      name: 'PLAY MORE',
      schemePrice: 2500,
      stockAllocated: 50,
      currentStock: 50,
      schemes: [{ id: 'sch_pm_1', name: 'PLAY MORE 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_muz_2',
      productId: 'prod_fj',
      name: 'FOUJI',
      schemePrice: 2500,
      stockAllocated: 10,
      currentStock: 10,
      schemes: [{ id: 'sch_fj_1', name: 'FOUJI 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_muz_3',
      productId: 'prod_es',
      name: 'EYE SUTRA',
      schemePrice: 2500,
      stockAllocated: 15,
      currentStock: 15,
      schemes: [{ id: 'sch_es_1', name: 'EYE SUTRA 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    },
    {
      id: 'dp_muz_4',
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
  db.districtProducts['Muzaffarnagar'] = FOUR_PRODUCTS;
  db.districtProducts['MUZAFFARNAGAR'] = FOUR_PRODUCTS;

  await saveDb();

  console.log('✅ Muzaffarnagar products successfully set to:');
  db.districtProducts['Muzaffarnagar'].forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.name} (Stock: ${p.currentStock})`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
