// scripts/add_special_products.js
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/database.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const SPECIAL_PRODUCTS = [
  { name: 'PLAY MORE' },
  { name: 'HEIGHT VEDA' },
  { name: 'ALERGY SAFA' },
  { name: 'EYE SUTRA' }
];

const DISTRICTS = [
  "Chittorgarh", "Alwar", "Bikaner", "Uttarakhand", "Udham Singh Nagar", "Jodhpur",
  "Kota", "Faridabad", "Gurgaon", "Rewari", "Muzaffarnagar", "Shamli"
];

if (!db.products) db.products = [];
if (!db.districtProducts) db.districtProducts = {};

SPECIAL_PRODUCTS.forEach(sp => {
  let existing = db.products.find(p => p.name.toUpperCase() === sp.name.toUpperCase());
  let prodId;
  if (!existing) {
    prodId = 'prod_' + (db.products.length + 1);
    const newProd = {
      id: prodId,
      name: sp.name,
      isActive: true,
      sortOrder: db.products.length + 1
    };
    db.products.push(newProd);
    console.log(`Added Master Product: ${sp.name} (${prodId})`);
  } else {
    prodId = existing.id;
    console.log(`Master Product already exists: ${sp.name} (${prodId})`);
  }

  // Ensure assigned to each district
  DISTRICTS.forEach(dist => {
    if (!db.districtProducts[dist]) db.districtProducts[dist] = [];
    const distHas = db.districtProducts[dist].find(dp => dp.productId === prodId || dp.name.toUpperCase() === sp.name.toUpperCase());
    if (!distHas) {
      db.districtProducts[dist].push({
        id: `dp_${dist.toLowerCase().slice(0, 3)}_${prodId}`,
        productId: prodId,
        name: sp.name,
        stockAllocated: 20,
        currentStock: 20,
        isActive: true
      });
    }
  });
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log('Successfully updated database with special products across all 12 districts!');
