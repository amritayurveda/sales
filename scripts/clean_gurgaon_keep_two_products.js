// scripts/clean_gurgaon_keep_two_products.js
const { initDb, db, saveDb } = require('../config/db');

async function main() {
  console.log('🚀 Cleaning Gurgaon to keep ONLY AMAR NETRAN and KADWI DAWA...');

  await initDb();

  const allowedNames = ['AMAR NETRAN', 'AMAR NETRAM', 'KADWI DAWA'];

  // 1. Clean db.districtProducts['Gurgaon']
  const curGur = db.districtProducts['Gurgaon'] || [];
  let filtered = curGur.filter(p => allowedNames.some(a => p.name.toUpperCase().includes(a) || a.includes(p.name.toUpperCase())));

  // If filtered is missing either, ensure both exist
  const hasAN = filtered.some(p => p.name.toUpperCase().includes('AMAR'));
  const hasKD = filtered.some(p => p.name.toUpperCase().includes('KADWI') || p.name.toUpperCase().includes('KD'));

  if (!hasAN) {
    filtered.push({
      id: 'dp_gur_1',
      productId: 'prod_an',
      name: 'AMAR NETRAN',
      schemePrice: 2500,
      stockAllocated: 11,
      currentStock: 11,
      schemes: [{ id: 'sch_an_1', name: 'AMAR NETRAN 1', qty: 1, price: 2500, dc: 250 }],
      isActive: true
    });
  }

  if (!hasKD) {
    filtered.push({
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
    });
  }

  db.districtProducts['Gurgaon'] = filtered;
  db.districtProducts['GURGAON'] = filtered;

  await saveDb();

  console.log(`✅ Gurgaon now has ONLY ${filtered.length} products:`);
  filtered.forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.name} (Stock: ${p.currentStock})`);
  });

  process.exit(0);
}

main().catch(err => {
  console.error('Error cleaning Gurgaon:', err);
  process.exit(1);
});
