// scripts/sync_faridabad_gurgaon_products.js
const { initDb, db, saveDb } = require('../config/db');

async function main() {
  console.log('🚀 Synchronizing Faridabad and Gurgaon to strictly the 2 products: AMAR NETRAN & KADWI DAWA...');

  await initDb();

  const TWO_PRODUCTS_FARIDABAD = [
    {
      id: 'dp_far_1',
      productId: 'prod_an',
      name: 'AMAR NETRAN',
      schemePrice: 2500,
      stockAllocated: 11,
      currentStock: 11,
      schemes: [{ id: 'sch_an_1', name: 'AMAR NETRAN 1', qty: 1, price: 2500, dc: 250 }],
      isActive: true
    },
    {
      id: 'dp_far_2',
      productId: 'prod_kd',
      name: 'KADWI DAWA',
      schemePrice: 2870,
      stockAllocated: 7.0,
      currentStock: 7.0,
      schemes: [
        { id: 'sch_kd_1', name: 'KD 1', qty: 1, price: 2870, dc: 250 },
        { id: 'sch_kd_2', name: 'KD 2', qty: 2, price: 5740, dc: 500 }
      ],
      isActive: true
    }
  ];

  const TWO_PRODUCTS_GURGAON = [
    {
      id: 'dp_gur_1',
      productId: 'prod_an',
      name: 'AMAR NETRAN',
      schemePrice: 2500,
      stockAllocated: 11,
      currentStock: 11,
      schemes: [{ id: 'sch_an_1', name: 'AMAR NETRAN 1', qty: 1, price: 2500, dc: 250 }],
      isActive: true
    },
    {
      id: 'dp_gur_2',
      productId: 'prod_kd',
      name: 'KADWI DAWA',
      schemePrice: 2870,
      stockAllocated: 7.0,
      currentStock: 7.0,
      schemes: [
        { id: 'sch_kd_1', name: 'KD 1', qty: 1, price: 2870, dc: 250 },
        { id: 'sch_kd_2', name: 'KD 2', qty: 2, price: 5740, dc: 500 }
      ],
      isActive: true
    }
  ];

  if (!db.districtProducts) db.districtProducts = {};
  db.districtProducts['Faridabad'] = TWO_PRODUCTS_FARIDABAD;
  db.districtProducts['FARIDABAD'] = TWO_PRODUCTS_FARIDABAD;
  db.districtProducts['Gurgaon'] = TWO_PRODUCTS_GURGAON;
  db.districtProducts['GURGAON'] = TWO_PRODUCTS_GURGAON;

  await saveDb();

  console.log('✅ Faridabad products successfully set to:');
  db.districtProducts['Faridabad'].forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.name} (Stock: ${p.currentStock})`);
  });

  console.log('✅ Gurgaon products successfully set to:');
  db.districtProducts['Gurgaon'].forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.name} (Stock: ${p.currentStock})`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
