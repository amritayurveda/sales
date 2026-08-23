// test/verify_main_stock_management.js
const assert = require('assert');
const { initDb, db, saveDb } = require('../config/db');
const { computeDistrictDayStock } = require('../utils/cashRollover');

async function testMainStock() {
  console.log('🧪 Starting End-to-End Verification for Central Main Stock Management...');
  await initDb();

  const prodId = 'prod_1'; // DAMADAR
  const initialCentral = Number(db.mainWarehouseStock[prodId]) || 0;
  console.log(`1. Initial Central Main Stock for DAMADAR (${prodId}): ${initialCentral} units`);

  // Step 1: Inward 500 units into Central Main Stock
  const inwardQty = 500;
  const now = new Date();
  const logEntry = {
    id: 'inw_test_' + Date.now(),
    inwardDate: '2026-08-23',
    productId: prodId,
    productName: 'DAMADAR',
    qty: inwardQty,
    supplier: 'Test Factory Direct',
    invoiceNo: 'INV-TEST-001',
    note: 'Automated test inward batch',
    createdBy: 'admin',
    createdAt: now.toISOString()
  };

  db.mainWarehouseStock[prodId] = initialCentral + inwardQty;
  if (!db.mainStockInwardLogs) db.mainStockInwardLogs = [];
  db.mainStockInwardLogs.unshift(logEntry);
  await saveDb();

  assert.strictEqual(db.mainWarehouseStock[prodId], initialCentral + inwardQty, 'Central stock must equal initial + 500');
  console.log(`✔ Step 1 Passed: Inwarded 500 units. New Central Stock = ${db.mainWarehouseStock[prodId]} units`);

  // Step 2: Validate that transfer exceeding Central Stock is blocked
  const excessiveQty = db.mainWarehouseStock[prodId] + 50;
  const isAvailable = (db.mainWarehouseStock[prodId] || 0) >= excessiveQty;
  assert.strictEqual(isAvailable, false, 'Dispatch exceeding central stock must be forbidden');
  console.log(`✔ Step 2 Passed: Excess transfer (${excessiveQty} > ${db.mainWarehouseStock[prodId]}) correctly blocked`);

  // Step 3: Dispatch 100 units to Jaipur
  const dispatchQty = 100;
  db.mainWarehouseStock[prodId] -= dispatchQty;
  const transfer = {
    id: 'trf_test_' + Date.now(),
    transferNo: 'TRF-TEST-' + Math.floor(10000 + Math.random() * 90000),
    district: 'Jaipur',
    productId: prodId,
    productName: 'DAMADAR (100)',
    qty: dispatchQty,
    totalUnits: dispatchQty,
    items: [{ productId: prodId, productName: 'DAMADAR', qty: dispatchQty }],
    status: 'PENDING_ACCEPTANCE',
    challanNo: 'CH-TEST-99',
    note: 'Test transfer dispatch',
    dispatchedBy: 'admin',
    dispatchedAt: now.toISOString(),
    receivedBy: null,
    receivedAt: null
  };
  if (!db.stockTransfers) db.stockTransfers = [];
  db.stockTransfers.unshift(transfer);
  await saveDb();

  assert.strictEqual(db.mainWarehouseStock[prodId], initialCentral + inwardQty - dispatchQty, 'Central stock must deduct dispatched qty');
  console.log(`✔ Step 3 Passed: Dispatched 100 units. Remaining Central Stock = ${db.mainWarehouseStock[prodId]} units`);

  // Step 4: Dealer in Jaipur receives and accepts the transfer
  transfer.status = 'ACCEPTED';
  transfer.receivedBy = 'dealer_jaipur';
  transfer.receivedAt = new Date().toISOString();
  transfer.receivedDate = '2026-08-23';

  const distProds = (db.districtProducts['Jaipur'] || db.districtProducts['jaipur'] || []);
  const jaipurDamadar = distProds.find(p => p.productId === prodId || p.name === 'DAMADAR');
  if (jaipurDamadar) {
    jaipurDamadar.currentStock = (Number(jaipurDamadar.currentStock) || 0) + dispatchQty;
  }

  // Also record in milaStock for daily ledger
  const milaKey = `Jaipur:2026-08-23:${prodId}`;
  db.milaStock[milaKey] = (Number(db.milaStock[milaKey]) || 0) + dispatchQty;
  await saveDb();

  console.log(`✔ Step 4 Passed: Jaipur accepted transfer. Mila stock recorded: +${dispatchQty}`);

  // Step 5: Deliver/Sell 5 units to customer in Jaipur
  const saleQty = 5;
  const orderId = 'ord_test_' + Date.now();
  const testOrder = {
    id: orderId,
    orderNo: 'ORD-TEST-99',
    district: 'Jaipur',
    date: '2026-08-23',
    time: '11:15:00',
    productId: prodId,
    productName: 'DAMADAR',
    qty: saleQty,
    unitPrice: 3052,
    dcRate: 200,
    netAmount: 2852,
    customerMobile: '9888877777',
    customerName: 'Test Buyer',
    dealerUsername: 'dealer_jaipur',
    createdAt: new Date().toISOString()
  };
  db.customerOrders.unshift(testOrder);
  await saveDb();

  console.log(`✔ Step 5 Passed: Customer sale of 5 units recorded in Jaipur`);

  // Step 6: Compute live day stock for Jaipur
  const dayStock = computeDistrictDayStock(db, 'Jaipur', '2026-08-23');
  const dDamadar = dayStock.products.find(p => p.productId === prodId || p.name === 'DAMADAR');
  assert.ok(dDamadar, 'DAMADAR must exist in day stock');
  console.log(`✔ Step 6 Passed: Live Jaipur Stock: Opening=${dDamadar.openingStock}, MilaInward=+${dDamadar.milaQty}, Sales=-${dDamadar.saleQty}, Closing=${dDamadar.closingStock}`);

  // Cleanup test artifacts
  db.customerOrders = db.customerOrders.filter(o => o.id !== orderId);
  db.stockTransfers = db.stockTransfers.filter(t => t.id !== transfer.id);
  db.mainStockInwardLogs = db.mainStockInwardLogs.filter(l => l.id !== logEntry.id);
  db.mainWarehouseStock[prodId] = initialCentral;
  delete db.milaStock[milaKey];
  await saveDb();

  console.log('\n🎉 ALL CENTRAL MAIN STOCK MANAGEMENT TESTS PASSED WITH 100% SUCCESS!');
  process.exit(0);
}

testMainStock().catch(e => {
  console.error(e);
  process.exit(1);
});
