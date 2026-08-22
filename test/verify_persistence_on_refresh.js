// test/verify_persistence_on_refresh.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');

const PORT = 3939;
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
  console.log('🚀 Running Full PostgreSQL Persistence & Refresh Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Kota Dealer
    console.log('1. Authenticating Kota Dealer:');
    const loginRes = await makeRequest('POST', '/auth/login', { username: 'dealer_kota', password: 'dealer123' });
    assert.strictEqual(loginRes.status, 200);
    const dealerToken = loginRes.data.token;
    const today = new Date().toISOString().slice(0, 10);
    console.log('  ✔ Kota Dealer logged in successfully');

    // 2. Get available products for Kota
    const stockRes = await makeRequest('GET', `/inventory/district-day-stock/Kota/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    assert.strictEqual(stockRes.status, 200);
    const prod = stockRes.data.products[0];
    assert(prod, 'Must have product in stock');

    // 3. Create customer sale in Kota
    console.log('\n2. Creating a new Customer Sale:');
    const createRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Kota',
        date: today,
        productId: prod.productId || prod.id,
        price: 2800,
        qty: 1,
        customerMobile: '9988776655',
        customerName: 'Persistence Test Customer',
        schemeName: `${prod.name} (₹2,800)`
      },
      { 'Authorization': `Bearer ${dealerToken}` }
    );
    assert.strictEqual(createRes.status, 201);
    const savedOrder = createRes.data.order;
    console.log(`  ✔ Order created: ${savedOrder.orderNo} for ${savedOrder.customerName} (₹${savedOrder.unitPrice})`);

    // 4. SIMULATE REFRESH / SERVER RESTART / RE-INIT
    console.log('\n3. Simulating Full Server Refresh & Re-Initialization (initDb):');
    // Clear in-memory db.customerOrders to simulate brand-new container cold start
    db.customerOrders = [];
    await initDb();
    console.log('  ✔ Database re-initialized from Neon PostgreSQL!');

    // 5. Fetch Daily Cash Ledger (Dealer Same-Day Sales on same page)
    console.log('\n4. Verifying Same-Day Sales on Dealer Home View after refresh:');
    const ledgerRes = await makeRequest('GET', `/cash/daily-ledger/Kota/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    assert.strictEqual(ledgerRes.status, 200);
    const ordersAfterRefresh = ledgerRes.data.orders;
    const found = ordersAfterRefresh.find(o => o.orderNo === savedOrder.orderNo || o.id === savedOrder.id);
    assert(found, 'Order must exist in same-day sales after refresh');
    assert.strictEqual(found.unitPrice, 2800);
    assert.strictEqual(found.customerMobile, '9988776655');
    console.log(`  ✔ Verified: Order ${found.orderNo} persists 100% on dealer same-day view with Price ₹${found.unitPrice}`);

    // 6. Verify District Customer Orders Endpoint
    const distOrdersRes = await makeRequest('GET', `/orders/district/Kota?date=${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    assert.strictEqual(distOrdersRes.status, 200);
    const foundInDist = distOrdersRes.data.orders.find(o => o.orderNo === savedOrder.orderNo);
    assert(foundInDist, 'Order must exist in district orders');
    console.log(`  ✔ Verified: Order appears in district customer orders list`);

    console.log('\n🎉 ALL PERSISTENCE AND SAME-DAY SALE ON SAME PAGE CHECKS PASSED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
