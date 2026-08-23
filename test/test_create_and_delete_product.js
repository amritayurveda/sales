// test/test_create_and_delete_product.js
const assert = require('assert');
const { initDb, db, saveDb } = require('../config/db');

async function testProductCreateAndDelete() {
  console.log('🧪 Testing Master Product Create & Delete persistence...');

  await initDb();
  const initialMasterCount = (db.products || []).length;
  console.log(`Initial master products count: ${initialMasterCount}`);

  // 1. Create a test product
  const testName = 'TEST_AUTO_VERIFY_' + Date.now().toString(36).toUpperCase();
  const testId = 'prod_test_' + Date.now();
  const newProd = {
    id: testId,
    name: testName,
    isSpecial: true,
    defaultPrice: 2400,
    schemes: [
      { id: 'sch_' + testId + '_1', name: testName + ' 1', qty: 1, price: 2400, dc: 170 }
    ]
  };

  db.products.push(newProd);

  // Assign to Chittorgarh
  if (!db.districtProducts['Chittorgarh']) db.districtProducts['Chittorgarh'] = [];
  db.districtProducts['Chittorgarh'].push({
    id: 'dp_chi_' + testId,
    productId: testId,
    name: testName,
    isSpecial: true,
    schemePrice: 2400,
    stockAllocated: 0,
    currentStock: 0,
    schemes: newProd.schemes,
    isActive: true
  });

  await saveDb();
  console.log(`✔ Created product ${testName} and saved to Neon PostgreSQL`);

  // 2. Reload DB from Neon PostgreSQL to verify persistence
  await initDb();
  const foundInMaster = (db.products || []).find(p => p.id === testId);
  const foundInChittor = (db.districtProducts['Chittorgarh'] || []).find(p => p.productId === testId);

  assert.ok(foundInMaster, 'Created product MUST be found in master catalog after reload');
  assert.ok(foundInChittor, 'Created product MUST be found in Chittorgarh after reload');
  console.log(`✔ Verified persistence: Product ${testName} exists after complete DB reload`);

  // 3. Delete the test product
  const idx = db.products.findIndex(p => p.id === testId);
  db.products.splice(idx, 1);
  db.districtProducts['Chittorgarh'] = db.districtProducts['Chittorgarh'].filter(p => p.productId !== testId && p.name !== testName);

  await saveDb();
  console.log(`✔ Deleted product ${testName} and saved to Neon PostgreSQL`);

  // 4. Reload DB again to verify deletion persisted
  await initDb();
  const checkMasterAfterDelete = (db.products || []).find(p => p.id === testId);
  const checkChittorAfterDelete = (db.districtProducts['Chittorgarh'] || []).find(p => p.productId === testId);

  assert.strictEqual(checkMasterAfterDelete, undefined, 'Deleted product MUST NOT exist in master catalog');
  assert.strictEqual(checkChittorAfterDelete, undefined, 'Deleted product MUST NOT exist in district');
  console.log(`✔ Verified permanent deletion: Product ${testName} is completely gone after DB reload`);

  console.log('\n🎉 ALL CREATE & DELETE PERSISTENCE TESTS PASSED!');
  process.exit(0);
}

testProductCreateAndDelete().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
