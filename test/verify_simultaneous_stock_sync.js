// test/verify_simultaneous_stock_sync.js
const assert = require('assert');
const { initDb, db, saveDb } = require('../config/db');
const { computeDistrictDayStock, getDistrictProductsSafely } = require('../utils/cashRollover');

async function testSimultaneousStockSync() {
  console.log('🧪 Verifying simultaneous multi-point stock sync & strict value isolation...');
  await initDb();

  const targetDate = '2026-08-23';

  // 1. Set Jaipur DAMADAR to 30
  const jaipurItems = getDistrictProductsSafely(db, 'Jaipur');
  let jDamadar = jaipurItems.find(p => p.name === 'DAMADAR');
  // Clear any existing test mila/orders for clean comparison
  if (db.milaStock) {
    delete db.milaStock['Jaipur:2026-08-23:prod_1'];
    delete db.milaStock['Gurgaon:2026-08-23:prod_1'];
  }
  if (db.customerOrders) {
    db.customerOrders = db.customerOrders.filter(o => o.productId !== 'prod_1');
  }

  assert.ok(jDamadar, 'DAMADAR must exist in Jaipur');
  jDamadar.stockAllocated = 30;
  jDamadar.currentStock = 30;
  jDamadar.isCustomStockLocked = true;
  db.customStockLocks['Jaipur:prod_1'] = 30;

  // 2. Set Gurgaon DAMADAR to 0
  const gurgaonItems = getDistrictProductsSafely(db, 'Gurgaon');
  let gDamadar = gurgaonItems.find(p => p.name === 'DAMADAR');
  if (!gDamadar) {
    gDamadar = {
      id: 'dp_gur_prod_1',
      productId: 'prod_1',
      name: 'DAMADAR',
      stockAllocated: 0,
      currentStock: 0,
      isCustomStockLocked: true,
      isActive: true
    };
    if (!db.districtProducts['Gurgaon']) db.districtProducts['Gurgaon'] = [];
    db.districtProducts['Gurgaon'].push(gDamadar);
  } else {
    gDamadar.stockAllocated = 0;
    gDamadar.currentStock = 0;
    gDamadar.isCustomStockLocked = true;
  }
  db.customStockLocks['Gurgaon:prod_1'] = 0;

  await saveDb();

  // 3. Test District Day Stock Register
  const jDayStock = computeDistrictDayStock(db, 'Jaipur', targetDate);
  const jd1 = jDayStock.products.find(p => p.name === 'DAMADAR');
  assert.strictEqual(jd1.openingStock, 30, 'Jaipur DAMADAR opening stock must be 30');
  assert.strictEqual(jd1.closingStock, 30, 'Jaipur DAMADAR closing stock must be 30');

  const gDayStock = computeDistrictDayStock(db, 'Gurgaon', targetDate);
  const gd1 = gDayStock.products.find(p => p.name === 'DAMADAR');
  assert.strictEqual(gd1.openingStock, 0, 'Gurgaon DAMADAR opening stock must be 0');
  assert.strictEqual(gd1.closingStock, 0, 'Gurgaon DAMADAR closing stock must be 0');

  console.log('✔ Step 1 Passed: Jaipur=30, Gurgaon=0 in District Stock Register simultaneously.');

  // 4. Test Central Main Stock Summary Calculation
  const activeDistricts = ['Jaipur', 'Gurgaon', 'Alwar', 'Bikaner', 'Chittorgarh', 'Faridabad', 'Jodhpur', 'Kota', 'Muzaffarnagar', 'Saharanpur', 'Uttarakhand', 'Udham Singh Nagar'];
  let totalBranchForDamadar = 0;
  const breakdown = {};

  activeDistricts.forEach(dist => {
    const ds = computeDistrictDayStock(db, dist, targetDate);
    const prod = ds.products.find(p => p.productId === 'prod_1' || p.name === 'DAMADAR');
    const closing = prod ? Number(prod.closingStock) || 0 : 0;
    breakdown[dist] = closing;
    totalBranchForDamadar += closing;
  });

  console.log('Central Warehouse Breakdown for DAMADAR:', breakdown);
  assert.strictEqual(breakdown['Jaipur'], 30, 'Breakdown for Jaipur must be 30');
  assert.strictEqual(breakdown['Gurgaon'], 0, 'Breakdown for Gurgaon must be 0');
  assert.ok(totalBranchForDamadar >= 30, 'Total branch stock must include Jaipur 30');

  console.log('✔ Step 2 Passed: Central Main Warehouse Live Distribution Matrix syncs simultaneously.');

  // 5. Test Full Serverless Restart Persistence
  console.log('🔄 Simulating serverless cold reload...');
  Object.keys(db).forEach(k => delete db[k]);
  await initDb();

  const reloadedJ = computeDistrictDayStock(db, 'Jaipur', targetDate);
  const rjd1 = reloadedJ.products.find(p => p.name === 'DAMADAR');
  assert.strictEqual(rjd1.openingStock, 30, 'Jaipur DAMADAR must remain 30 after reload');

  const reloadedG = computeDistrictDayStock(db, 'Gurgaon', targetDate);
  const rgd1 = reloadedG.products.find(p => p.name === 'DAMADAR');
  assert.strictEqual(rgd1.openingStock, 0, 'Gurgaon DAMADAR must remain 0 after reload');

  console.log('✔ Step 3 Passed: 100% persistent stock retained across restarts.');

  console.log('\n🎉 ALL SIMULTANEOUS STOCK SYNC & STORAGE TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

testSimultaneousStockSync().catch(e => {
  console.error(e);
  process.exit(1);
});
