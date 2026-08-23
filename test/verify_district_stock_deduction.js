// test/verify_district_stock_deduction.js
const assert = require('assert');
const { initDb, db, saveDb } = require('../config/db');
const { computeDistrictDayStock } = require('../utils/cashRollover');

async function run() {
  console.log('🧪 Verifying new district stock deduction and dynamic matrix...');
  await initDb();

  const distName = 'Jaipur';
  const targetDate = '2026-08-23';

  // Create temporary test order
  const orderId = 'ord_verify_' + Date.now();
  const testOrder = {
    id: orderId,
    orderNo: 'ORD-VERIFY-1',
    district: distName,
    date: targetDate,
    time: '12:00:00',
    productId: 'prod_1',
    productName: 'DAMADAR',
    qty: 1,
    unitPrice: 3052,
    dcRate: 200,
    netAmount: 2852,
    customerMobile: '9999999999',
    customerName: 'Test Buyer',
    dealerUsername: 'dealer_jaipur',
    createdAt: new Date().toISOString()
  };

  if (!db.customerOrders) db.customerOrders = [];
  db.customerOrders.unshift(testOrder);

  // Compute day stock for Jaipur
  const stockData = computeDistrictDayStock(db, distName, targetDate);
  assert.ok(stockData.products.length > 0, 'Jaipur must have products');

  const damadar = stockData.products.find(p => p.name === 'DAMADAR');
  assert.ok(damadar, 'DAMADAR must exist in Jaipur');
  
  console.log(`✔ Jaipur DAMADAR: Opening=${damadar.openingStock}, Sale=${damadar.saleQty}, Remaining=${damadar.remainStock}, Closing=${damadar.closingStock}`);
  assert.strictEqual(damadar.saleQty, 1, 'Sale qty must be 1 from the customer order');
  assert.strictEqual(damadar.closingStock, Math.round((damadar.remainStock + damadar.milaQty) * 10) / 10, 'Closing stock formula verified');

  // Cleanup test order
  db.customerOrders = db.customerOrders.filter(o => o.id !== orderId);

  console.log('\n🎉 ALL STOCK DEDUCTION TESTS PASSED!');
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
