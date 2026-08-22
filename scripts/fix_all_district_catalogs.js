// scripts/fix_all_district_catalogs.js
const { initDb, db, saveDb } = require('../config/db');

async function main() {
  console.log('🚀 Fixing all district catalogs to strict user configuration...');

  await initDb();

  const FOUR_PRODUCTS = [
    {
      id: 'dp_sah_1',
      productId: 'prod_pm',
      name: 'PLAY MORE',
      isSpecial: true,
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
      isSpecial: true,
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
      isSpecial: true,
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
      isSpecial: true,
      schemePrice: 2500,
      stockAllocated: 12,
      currentStock: 12,
      schemes: [{ id: 'sch_alg_1', name: 'ALERGY 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    }
  ];

  const TWO_PRODUCTS = [
    {
      id: 'dp_gur_1',
      productId: 'prod_an',
      name: 'AMAR NETRAN',
      isSpecial: false,
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
      isSpecial: false,
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

  // 1. Reset district products
  db.districtProducts = {
    'Saharanpur': JSON.parse(JSON.stringify(FOUR_PRODUCTS)),
    'SAHARANPUR': JSON.parse(JSON.stringify(FOUR_PRODUCTS)),
    'Muzaffarnagar': JSON.parse(JSON.stringify(FOUR_PRODUCTS)),
    'MUZAFFARNAGAR': JSON.parse(JSON.stringify(FOUR_PRODUCTS)),
    'Gurgaon': JSON.parse(JSON.stringify(TWO_PRODUCTS)),
    'GURGAON': JSON.parse(JSON.stringify(TWO_PRODUCTS)),
    'Faridabad': JSON.parse(JSON.stringify(TWO_PRODUCTS)),
    'FARIDABAD': JSON.parse(JSON.stringify(TWO_PRODUCTS))
  };

  // For other active districts, initialize to empty array unless user assigns products
  for (const dist of (db.districts || [])) {
    if (!db.districtProducts[dist]) {
      db.districtProducts[dist] = [];
    }
  }

  // Remove deleted districts
  delete db.districtProducts['Rewari'];
  delete db.districtProducts['Shamli'];

  await saveDb();

  console.log('\n--- Final Product Catalogs Per District ---');
  for (const dist of (db.districts || [])) {
    const prods = db.districtProducts[dist] || [];
    console.log(`📍 ${dist} (${prods.length} products):`, prods.map(p => p.name));
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error fixing catalogs:', err);
  process.exit(1);
});
