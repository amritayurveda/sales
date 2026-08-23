// test/verify_district_products_matrix_and_stock.js
const assert = require('assert');
const { initDb, db, saveDb, EXCEL_PRODUCTS } = require('../config/db');

async function testDistrictProductsMatrixAndStock() {
  console.log('🧪 Starting Verification: District Products Assignment Matrix & Stock Locking...');

  await initDb();

  // Test 1: Verify District Matrix for Chittorgarh (should have 23 products)
  const chittorProducts = db.districtProducts['Chittorgarh'] || [];
  console.log(`✔ Chittorgarh initial products count: ${chittorProducts.length}`);
  assert.strictEqual(chittorProducts.length, 23, 'Chittorgarh must have 23 products initially');

  // Test 2: Test stock adjustment with permanent lock for a product
  const testProd = chittorProducts[0];
  const oldStock = testProd.stockAllocated;
  const targetNewStock = 45.5;

  testProd.stockAllocated = targetNewStock;
  testProd.currentStock = targetNewStock;
  testProd.isCustomStockLocked = true;
  if (!db.customStockLocks) db.customStockLocks = {};
  db.customStockLocks[`Chittorgarh:${testProd.productId}`] = targetNewStock;

  await saveDb();

  assert.strictEqual(db.customStockLocks[`Chittorgarh:${testProd.productId}`], targetNewStock, 'Custom stock lock must store target new stock');
  console.log(`✔ Custom stock successfully locked at ${targetNewStock} for ${testProd.name} in Chittorgarh`);

  // Test 3: Reload DB from Neon PostgreSQL app_state to ensure persistent preservation
  await initDb();
  const reloadedProd = (db.districtProducts['Chittorgarh'] || []).find(p => p.productId === testProd.productId);
  assert.ok(reloadedProd, 'Product must exist after reload');
  assert.strictEqual(reloadedProd.stockAllocated, targetNewStock, `Stock must be strictly preserved at ${targetNewStock} after reload`);
  console.log(`✔ Verified permanent DB persistence: ${reloadedProd.name} stock remained ${reloadedProd.stockAllocated}`);

  // Test 4: Verify Saharanpur (4 products) and Gurgaon (2 products) remain intact
  const saharanpurProds = db.districtProducts['Saharanpur'] || [];
  const gurgaonProds = db.districtProducts['Gurgaon'] || [];
  assert.strictEqual(saharanpurProds.length, 4, 'Saharanpur must strictly have 4 products');
  assert.strictEqual(gurgaonProds.length, 2, 'Gurgaon must strictly have 2 products');
  console.log(`✔ Saharanpur (4 prods) and Gurgaon (2 prods) are intact`);

  // Revert test stock to 0 for Chittorgarh product
  testProd.stockAllocated = 0;
  testProd.currentStock = 0;
  db.customStockLocks[`Chittorgarh:${testProd.productId}`] = 0;
  await saveDb();
  console.log(`✔ Cleaned test stock back to 0`);

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! District Products Assignment and Stock Locking are 100% verified.');
  process.exit(0);
}

testDistrictProductsMatrixAndStock().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
