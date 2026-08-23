// test/verify_persistence_on_reload.js
const assert = require('assert');
const { initDb, db, saveDb } = require('../config/db');
const { computeDistrictDayStock, getDistrictProductsSafely } = require('../utils/cashRollover');

async function testPersistenceOnReload() {
  console.log('🧪 Verifying that stock values NEVER reset to 0 upon reload/restart...');
  
  // Step 1: Initial load
  await initDb();

  // Set explicit stocks for Jaipur
  const jaipurProds = getDistrictProductsSafely(db, 'Jaipur');
  const d1 = jaipurProds.find(p => p.name === 'DAMADAR');
  const d2 = jaipurProds.find(p => p.name === 'TONIC+FM');
  const d5 = jaipurProds.find(p => p.name === 'KADWI DAWA');

  assert.ok(d1, 'DAMADAR must exist in Jaipur');
  assert.ok(d2, 'TONIC+FM must exist in Jaipur');
  assert.ok(d5, 'KADWI DAWA must exist in Jaipur');

  d1.stockAllocated = 25;
  d1.currentStock = 25;
  d1.isCustomStockLocked = true;
  db.customStockLocks['Jaipur:prod_1'] = 25;

  d2.stockAllocated = 14;
  d2.currentStock = 14;
  d2.isCustomStockLocked = true;
  db.customStockLocks['Jaipur:prod_2'] = 14;

  d5.stockAllocated = 33;
  d5.currentStock = 33;
  d5.isCustomStockLocked = true;
  db.customStockLocks['Jaipur:prod_5'] = 33;

  await saveDb();
  console.log('✔ Step 1 Passed: Set and saved locked stocks (25, 14, 33) to PostgreSQL.');

  // Step 2: SIMULATE A COMPLETE COLD SERVERLESS RELOAD
  console.log('🔄 Simulating complete cold reload (wiping in-memory state)...');
  Object.keys(db).forEach(k => delete db[k]);

  // Re-run initDb()
  await initDb();

  // Step 3: Verify stocks after reload
  const reloadedJaipur = getDistrictProductsSafely(db, 'Jaipur');
  const rd1 = reloadedJaipur.find(p => p.name === 'DAMADAR');
  const rd2 = reloadedJaipur.find(p => p.name === 'TONIC+FM');
  const rd5 = reloadedJaipur.find(p => p.name === 'KADWI DAWA');

  console.log(`Reloaded Jaipur Stocks: DAMADAR=${rd1.stockAllocated}, TONIC+FM=${rd2.stockAllocated}, KADWI DAWA=${rd5.stockAllocated}`);

  assert.strictEqual(rd1.stockAllocated, 25, 'DAMADAR stock must remain 25 after reload');
  assert.strictEqual(rd2.stockAllocated, 14, 'TONIC+FM stock must remain 14 after reload');
  assert.strictEqual(rd5.stockAllocated, 33, 'KADWI DAWA stock must remain 33 after reload');

  // Verify computeDistrictDayStock after reload
  const dayStock = computeDistrictDayStock(db, 'Jaipur', '2026-08-23');
  const ds1 = dayStock.products.find(p => p.name === 'DAMADAR');
  assert.strictEqual(ds1.openingStock, 25, 'Day opening stock must be 25');

  console.log('✔ Step 3 Passed: Verified 100% persistence on reload. No stocks reset to 0!');

  console.log('\n🎉 ALL RELOAD & PERSISTENCE STORAGE TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

testPersistenceOnReload().catch(e => {
  console.error(e);
  process.exit(1);
});
