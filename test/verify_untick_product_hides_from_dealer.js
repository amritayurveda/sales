// test/verify_untick_product_hides_from_dealer.js
const assert = require('assert');
const { initDb, db, saveDb } = require('../config/db');
const { computeDistrictDayStock } = require('../utils/cashRollover');

async function testUntickProductHidesFromDealer() {
  console.log('🧪 Verifying that unticking a product immediately and permanently removes it from the dealer ID...');
  await initDb();

  const district = 'Jaipur';
  const targetDate = '2026-08-23';
  const testProdName = 'PLAY MORE';

  // 1. Initial State: Ensure product is active
  if (!db.districtProducts[district]) db.districtProducts[district] = [];
  let prod = db.districtProducts[district].find(p => p.name === testProdName);
  const master = (db.products || []).find(p => p.name.toUpperCase() === testProdName.toUpperCase());
  const prodId = master ? master.id : 'prod_20';

  if (!prod) {
    prod = {
      id: `dp_jai_${prodId}`,
      productId: prodId,
      name: testProdName,
      isSpecial: true,
      schemePrice: 2500,
      stockAllocated: 15,
      currentStock: 15,
      isActive: true,
      isCustomStockLocked: true
    };
    db.districtProducts[district].push(prod);
  } else {
    prod.isActive = true;
    prod.stockAllocated = 15;
    prod.currentStock = 15;
  }
  if (db.unassignedDistrictProducts) {
    delete db.unassignedDistrictProducts[`${district}:${prodId}`];
    delete db.unassignedDistrictProducts[`${district}:${testProdName}`];
  }
  await saveDb();

  const stockBeforeUntick = computeDistrictDayStock(db, district, targetDate);
  const foundBefore = stockBeforeUntick.products.find(p => p.name === testProdName);
  assert.ok(foundBefore, 'Product MUST be present in dealer stock before unticking');
  console.log(`✔ Step 1 Passed: Product "${testProdName}" is visible to dealer (Stock=${foundBefore.closingStock}).`);

  // 2. Untick / Deactivate the product
  console.log(`\n🚫 Unticking product "${testProdName}" for district "${district}"...`);
  prod.isActive = false;
  prod.stockAllocated = 0;
  prod.currentStock = 0;
  prod.isCustomStockLocked = false;
  if (!db.unassignedDistrictProducts) db.unassignedDistrictProducts = {};
  db.unassignedDistrictProducts[`${district}:${prod.productId}`] = true;
  db.unassignedDistrictProducts[`${district}:${testProdName}`] = true;
  if (db.customStockLocks) {
    delete db.customStockLocks[`${district}:${prod.productId}`];
    delete db.customStockLocks[`${district}:${testProdName}`];
  }
  await saveDb();

  const stockAfterUntick = computeDistrictDayStock(db, district, targetDate);
  const foundAfter = stockAfterUntick.products.find(p => p.name === testProdName);
  assert.strictEqual(foundAfter, undefined, 'Product MUST NOT be present in dealer stock after unticking');
  console.log(`✔ Step 2 Passed: Product "${testProdName}" is 100% HIDDEN from dealer ID.`);

  // 3. Cold Reload Test
  console.log('\n🔄 Simulating cold server reload from PostgreSQL...');
  Object.keys(db).forEach(k => delete db[k]);
  await initDb();

  const stockAfterReload = computeDistrictDayStock(db, district, targetDate);
  const foundAfterReload = stockAfterReload.products.find(p => p.name === testProdName);
  assert.strictEqual(foundAfterReload, undefined, 'Product MUST REMAIN HIDDEN after cold database reload');
  console.log(`✔ Step 3 Passed: Unticked status persisted on database reload.`);

  // 4. Re-tick Product
  console.log(`\n✅ Re-ticking product "${testProdName}" for district "${district}"...`);
  let reloadedProd = db.districtProducts[district].find(p => p.name === testProdName);
  assert.ok(reloadedProd, 'Product entry must exist in district products table');
  reloadedProd.isActive = true;
  reloadedProd.stockAllocated = 20;
  reloadedProd.currentStock = 20;
  delete db.unassignedDistrictProducts[`${district}:${reloadedProd.productId}`];
  delete db.unassignedDistrictProducts[`${district}:${testProdName}`];
  await saveDb();

  const stockAfterRetick = computeDistrictDayStock(db, district, targetDate);
  const foundAfterRetick = stockAfterRetick.products.find(p => p.name === testProdName);
  assert.ok(foundAfterRetick, 'Product MUST reappear in dealer ID after re-ticking');
  assert.strictEqual(foundAfterRetick.closingStock, 20, 'Stock must match new value');
  console.log(`✔ Step 4 Passed: Product "${testProdName}" reappeared in dealer ID (Stock=${foundAfterRetick.closingStock}).`);

  console.log('\n🎉 ALL UNTICK & DEALER VISIBILITY TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

testUntickProductHidesFromDealer().catch(e => {
  console.error('❌ Test Failed:', e);
  process.exit(1);
});
