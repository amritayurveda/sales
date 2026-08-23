// scripts/check_products.js
const { initDb, db, saveDb } = require('../config/db');

async function run() {
  await initDb();
  console.log('--- CURRENT MASTER PRODUCTS ---');
  console.log('Count:', (db.products || []).length);
  console.log('Products:', (db.products || []).map(p => ({ id: p.id, name: p.name, isSpecial: p.isSpecial })));
  console.log('Deleted Master Products List:', db.deletedMasterProducts || []);
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
