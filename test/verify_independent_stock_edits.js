// test/verify_independent_stock_edits.js
const assert = require('assert');
const { initDb, db, saveDb } = require('../config/db');
const { getDistrictProductsSafely, computeDistrictDayStock } = require('../utils/cashRollover');

async function testIndependentStockEdits() {
  console.log('🧪 Verifying independent district stock edits and lock persistence...');
  await initDb();

  const district = 'Jaipur';

  // Helper to adjust stock exactly as POST /adjust-base-stock does
  function adjustStock(productId, newStock) {
    if (!db.districtProducts) db.districtProducts = {};
    if (!db.customStockLocks) db.customStockLocks = {};

    let items = getDistrictProductsSafely(db, district);
    let item = items.find(p => p.productId === productId || p.id === productId || (p.name && p.name.toUpperCase() === productId.toUpperCase()));
    
    assert.ok(item, `Item ${productId} must exist in district`);
    item.stockAllocated = newStock;
    item.currentStock = newStock;
    item.isCustomStockLocked = true;
    db.customStockLocks[`${district}:${item.productId}`] = newStock;
    db.customStockLocks[`${district.toLowerCase()}:${item.productId}`] = newStock;
  }

  // 1. Edit Product 1 (DAMADAR) -> 25
  adjustStock('prod_1', 25);
  await saveDb();

  // 2. Edit Product 2 (TONIC+FM) -> 14
  adjustStock('prod_2', 14);
  await saveDb();

  // 3. Edit Product 5 (KADWI DAWA) -> 33
  adjustStock('prod_5', 33);
  await saveDb();

  // Verify in memory
  let items = getDistrictProductsSafely(db, district);
  const p1 = items.find(p => p.productId === 'prod_1');
  const p2 = items.find(p => p.productId === 'prod_2');
  const p5 = items.find(p => p.productId === 'prod_5');

  assert.strictEqual(p1.stockAllocated, 25, 'DAMADAR stock must remain 25');
  assert.strictEqual(p2.stockAllocated, 14, 'TONIC+FM stock must remain 14');
  assert.strictEqual(p5.stockAllocated, 33, 'KADWI DAWA stock must remain 33');
  console.log(`✔ Memory verification passed: DAMADAR=25, TONIC+FM=14, KADWI DAWA=33`);

  // Verify in computeDistrictDayStock
  const dayStock = computeDistrictDayStock(db, district, '2026-08-23');
  const ds1 = dayStock.products.find(p => p.productId === 'prod_1');
  const ds2 = dayStock.products.find(p => p.productId === 'prod_2');
  const ds5 = dayStock.products.find(p => p.productId === 'prod_5');

  assert.strictEqual(ds1.openingStock, 25, 'Day stock opening for DAMADAR must be 25');
  assert.strictEqual(ds2.openingStock, 14, 'Day stock opening for TONIC+FM must be 14');
  assert.strictEqual(ds5.openingStock, 33, 'Day stock opening for KADWI DAWA must be 33');
  console.log(`✔ Day stock rollover passed: all 3 edited products retained independent locked stocks`);

  console.log('\n🎉 ALL INDEPENDENT STOCK EDIT TESTS PASSED!');
  process.exit(0);
}

testIndependentStockEdits().catch(e => {
  console.error(e);
  process.exit(1);
});
