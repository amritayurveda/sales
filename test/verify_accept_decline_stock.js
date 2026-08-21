// test/verify_accept_decline_stock.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb } = require('../config/db');
const { pool } = require('../config/postgres');

const PORT = 3917;
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
  console.log('🚀 Running Accept and Decline Stock Consignment Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin and Kota Dealer
    console.log('1. Authenticating Admin & Kota Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    const dealerLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_kota', password: 'dealer123' });
    assert.strictEqual(dealerLogin.status, 200);
    const dealerToken = dealerLogin.data.token;
    console.log('  ✔ Kota Dealer logged in');

    const today = new Date().toISOString().slice(0, 10);
    const initialStockRes = await makeRequest('GET', `/inventory/district-day-stock/Kota/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const p1 = initialStockRes.data.products[0];
    const initialStockP1 = p1.closingStock || 0;

    // 2. Dispatch Consignment 1 (To be Accepted)
    console.log('\n2. Admin Dispatches Consignment 1 (50 units) to Kota:');
    const dispatch1 = await makeRequest(
      'POST',
      '/inventory/dispatch-stock',
      {
        district: 'Kota',
        items: [{ productId: p1.productId || p1.id, qty: 50 }],
        challanNo: 'CH-ACC-101',
        note: 'Accepted consignment test'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(dispatch1.status, 201);
    const trf1 = dispatch1.data.transfer;
    console.log(`  ✔ Dispatched TRF-1: ${trf1.transferNo}`);

    // 3. Dealer Accepts Consignment 1
    console.log('\n3. Kota Dealer Accepts Consignment 1:');
    const accept1 = await makeRequest(
      'POST',
      `/inventory/accept-stock/${trf1.id}`,
      { date: today },
      { 'Authorization': `Bearer ${dealerToken}` }
    );
    assert.strictEqual(accept1.status, 200);
    console.log(`  ✔ Dealer accepted TRF-1: "${accept1.data.message}"`);

    // Verify stock increased
    const afterAcceptStock = await makeRequest('GET', `/inventory/district-day-stock/Kota/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const afterItemP1 = afterAcceptStock.data.products.find(p => p.productId === p1.productId);
    assert.strictEqual(afterItemP1.closingStock, initialStockP1 + 50, 'Stock must increase by 50');
    console.log(`  ✔ Verified: Kota Stock increased to ${afterItemP1.closingStock} (+50 units)`);

    // 4. Dispatch Consignment 2 (To be Declined)
    console.log('\n4. Admin Dispatches Consignment 2 (100 units) to Kota:');
    const dispatch2 = await makeRequest(
      'POST',
      '/inventory/dispatch-stock',
      {
        district: 'Kota',
        items: [{ productId: p1.productId || p1.id, qty: 100 }],
        challanNo: 'CH-DEC-202',
        note: 'Damaged parcel in transit test'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(dispatch2.status, 201);
    const trf2 = dispatch2.data.transfer;
    console.log(`  ✔ Dispatched TRF-2: ${trf2.transferNo}`);

    // 5. Dealer Declines Consignment 2
    console.log('\n5. Kota Dealer Declines Consignment 2:');
    const decline2 = await makeRequest(
      'POST',
      `/inventory/decline-stock/${trf2.id}`,
      { reason: 'Parcel carton was severely torn and bottles broken in transit' },
      { 'Authorization': `Bearer ${dealerToken}` }
    );
    assert.strictEqual(decline2.status, 200);
    assert.strictEqual(decline2.data.transfer.status, 'DECLINED');
    console.log(`  ✔ Dealer declined TRF-2: Status = ${decline2.data.transfer.status}, Reason = "${decline2.data.transfer.declineReason}"`);

    // 6. Verify Stock has NOT increased from declined consignment
    console.log('\n6. Verifying stock did NOT change after decline:');
    const afterDeclineStock = await makeRequest('GET', `/inventory/district-day-stock/Kota/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const finalItemP1 = afterDeclineStock.data.products.find(p => p.productId === p1.productId);
    assert.strictEqual(finalItemP1.closingStock, initialStockP1 + 50, 'Stock must NOT change after decline');
    console.log(`  ✔ Verified: Kota Stock remains strictly ${finalItemP1.closingStock} units!`);

    // 7. Verify PostgreSQL status for Declined Consignment
    console.log('\n7. Verifying PostgreSQL record for Declined Consignment:');
    const pgCheck = await pool.query('SELECT * FROM stock_transfers WHERE id = $1;', [trf2.id]);
    assert(pgCheck.rows.length > 0);
    assert.strictEqual(pgCheck.rows[0].status, 'DECLINED');
    assert.strictEqual(pgCheck.rows[0].declined_by, 'dealer_kota');
    assert(pgCheck.rows[0].decline_reason.includes('severely torn'));
    console.log(`  ✔ PostgreSQL Verified: ${trf2.transferNo} is recorded as DECLINED by ${pgCheck.rows[0].declined_by}`);

    console.log('\n🎉 ACCEPT AND DECLINE STOCK SYSTEM IS 100% VERIFIED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
