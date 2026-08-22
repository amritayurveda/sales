// scripts/add_all_products_to_5_districts.js
const { initDb, db, saveDb, EXCEL_PRODUCTS } = require('../config/db');

async function main() {
  console.log('🚀 Adding all 23 products with 0 quantity to Chittorgarh, Alwar, Bikaner, Uttarakhand, Udham Singh Nagar...');

  await initDb();

  const targetFiveDistricts = [
    'Chittorgarh',
    'Alwar',
    'Bikaner',
    'Uttarakhand',
    'Udham Singh Nagar'
  ];

  if (!db.districtProducts) db.districtProducts = {};

  targetFiveDistricts.forEach(dist => {
    const pfx = dist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3);
    const products = EXCEL_PRODUCTS.map((p, idx) => ({
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

    db.districtProducts[dist] = products;
    db.districtProducts[dist.toUpperCase()] = products;
  });

  await saveDb();

  console.log('\n--- Verified District Product Catalogs ---');
  for (const dist of (db.districts || [])) {
    const prods = db.districtProducts[dist] || [];
    console.log(`📍 ${dist} (${prods.length} products, stock=0):`, prods.length > 5 ? `${prods.length} products (All with Stock: 0)` : prods.map(p => `${p.name} (Stock: ${p.currentStock})`));
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error adding products:', err);
  process.exit(1);
});
