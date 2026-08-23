// test/verify_district_stock_deduction.js
const assert = require('assert');
const { initDb, db, saveDb } = require('../config/db');
const { computeDistrictDayStock } = require('../utils/cashRollover');

async function run() {
  console.log('🧪 Verifying new district stock deduction and dynamic matrix...');
  await initDb();

  const distName = 'Jaipur';
  const targetDate = '2026-08-23';

  // Compute day stock for Jaipur
  const stockData = computeDistrictDayStock(db, distName, targetDate);
  assert.ok(stockData.products.length > 0, 'Jaipur must have products');

  const damadar = stockData.products.find(p => p.name === 'DAMADAR');
  assert.ok(damadar, 'DAMADAR must exist in Jaipur');
  
  console.log(`✔ Jaipur DAMADAR: Opening=${damadar.openingStock}, Sale=${damadar.saleQty}, Remaining=${damadar.remainStock}, Closing=${damadar.closingStock}`);
  assert.strictEqual(damadar.saleQty, 1, 'Sale qty must be 1 from the customer order');
  assert.strictEqual(damadar.closingStock, 7.1, 'Closing stock must be 8.1 - 1 = 7.1');

  console.log('\n🎉 ALL STOCK DEDUCTION TESTS PASSED!');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
