// test/verify_stock_transfer.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');
const { pool } = require('../config/postgres');

const PORT = 3915;
let server;

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (dataString) {
      reqHeaders['Content-Length'] = Buffer.byteLength(dataString);
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path: `/api${path}`,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try {
            const parsed = raw ? JSON.parse(raw) : {};
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, raw });
          }
        });
      }
    );

    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Running Stock Dispatch & Dealer Inward Acceptance Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin and Dealer
    console.log('1. Authenticating Admin & Chittorgarh Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    const dealerLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(dealerLogin.status, 200);
    const dealerToken = dealerLogin.data.token;
    console.log('  ✔ Dealer logged in');

    // 2. Check initial stock of PLAY MORE in Chittorgarh
    const today = new Date().toISOString().slice(0, 10);
    const initialStockRes = await makeRequest('GET', `/inventory/district-day-stock/Chittorgarh/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const initialItem = initialStockRes.data.products.find(p => p.name.toUpperCase().includes('PLAY MORE')) || initialStockRes.data.products[0];
    const initialStock = initialItem.closingStock || 0;
    const targetProductId = initialItem.productId || initialItem.id;
    console.log(`\n2. Initial ${initialItem.name} stock in Chittorgarh: ${initialStock} units (ID: ${targetProductId})`);

    // 3. Admin Dispatches 50 units to Chittorgarh
    console.log(`\n3. Admin Dispatches 50 Units of ${initialItem.name} to Chittorgarh:`);
    const dispatchRes = await makeRequest(
      'POST',
      '/inventory/dispatch-stock',
      {
        district: 'Chittorgarh',
        productId: targetProductId,
        qty: 50,
        challanNo: 'CH-8899',
        note: 'Express shipment via SafeExpress'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(dispatchRes.status, 201);
    const transfer = dispatchRes.data.transfer;
    assert.strictEqual(transfer.status, 'PENDING_ACCEPTANCE');
    assert.strictEqual(transfer.qty, 50);
    console.log(`  ✔ Transfer Created: ${transfer.transferNo} (Status: ${transfer.status})`);

    // 4. Verify Stock has NOT increased yet before Dealer acceptance
    const midStockRes = await makeRequest('GET', `/inventory/district-day-stock/Chittorgarh/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const midItem = midStockRes.data.products.find(p => p.name.toUpperCase() === 'PLAY MORE') || { closingStock: 0 };
    assert.strictEqual(midItem.closingStock, initialStock, 'Stock must NOT change while in-transit');
    console.log(`  ✔ Verified: Stock remains ${midItem.closingStock} units while In-Transit (Pending Dealer Acceptance)`);

    // 5. Dealer views incoming shipments
    console.log('\n4. Dealer queries incoming shipments:');
    const incomingRes = await makeRequest('GET', '/inventory/transfers/Chittorgarh', null, { 'Authorization': `Bearer ${dealerToken}` });
    assert.strictEqual(incomingRes.status, 200);
    const pendingTransfers = incomingRes.data.pendingTransfers;
    assert(pendingTransfers.some(t => t.id === transfer.id));
    console.log(`  ✔ Dealer sees ${incomingRes.data.pendingCount} pending shipment(s) awaiting receipt`);

    // 6. Dealer accepts the shipment (e.g. after delivery arrives)
    console.log('\n5. Dealer receives and accepts the shipment:');
    const acceptRes = await makeRequest(
      'POST',
      `/inventory/accept-stock/${transfer.id}`,
      { date: today },
      { 'Authorization': `Bearer ${dealerToken}` }
    );
    assert.strictEqual(acceptRes.status, 200);
    console.log(`  ✔ Acceptance Response: "${acceptRes.data.message}"`);

    // 7. Verify Stock has increased by exactly 50 units
    console.log('\n6. Verifying updated stock and Mila Inward:');
    const finalStockRes = await makeRequest('GET', `/inventory/district-day-stock/Chittorgarh/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const finalItem = finalStockRes.data.products.find(p => p.name.toUpperCase() === 'PLAY MORE');
    assert.strictEqual(finalItem.closingStock, initialStock + 50, 'Stock must increase by exactly 50 units upon acceptance');
    assert.strictEqual(finalItem.milaQty, 50, 'Mila (Inward) register must record +50 units');
    console.log(`  ✔ Verified: New Closing Stock is ${finalItem.closingStock} (+50 units added) and Mila Inward is +${finalItem.milaQty}!`);

    // 8. Verify status in PostgreSQL database
    console.log('\n7. Verifying status in Neon PostgreSQL database:');
    const pgCheck = await pool.query('SELECT * FROM stock_transfers WHERE id = $1;', [transfer.id]);
    assert(pgCheck.rows.length > 0);
    assert.strictEqual(pgCheck.rows[0].status, 'ACCEPTED');
    assert.strictEqual(pgCheck.rows[0].received_by, 'dealer_chittorgarh');
    console.log(`  ✔ Verified PostgreSQL record: Transfer ${transfer.transferNo} is marked ACCEPTED by ${pgCheck.rows[0].received_by}`);

    console.log('\n🎉 ADMIN STOCK DISPATCH & DEALER INWARD ACCEPTANCE SYSTEM IS 100% VERIFIED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
