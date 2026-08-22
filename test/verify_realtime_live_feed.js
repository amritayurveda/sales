// test/verify_realtime_live_feed.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb } = require('../config/db');

const PORT = 3931;
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
  console.log('🚀 Running Zero-Delay Real-Time Live Sales Notification Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin and Dealer
    console.log('1. Authenticating Admin & Alwar Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    const dealerLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_alwar', password: 'dealer123' });
    assert.strictEqual(dealerLogin.status, 200);
    const dealerToken = dealerLogin.data.token;
    console.log('  ✔ Alwar Dealer logged in');

    const today = new Date().toISOString().slice(0, 10);

    // 2. Admin checks baseline live feed
    console.log('\n2. Admin captures baseline live-feed status:');
    const feed1 = await makeRequest('GET', `/admin/live-feed?date=${today}&since=0`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(feed1.status, 200);
    const baselineTimestamp = feed1.data.lastTimestamp;
    const baselineCount = feed1.data.totalTodayOrders;
    console.log(`  ✔ Baseline timestamp: ${baselineTimestamp}, Orders today: ${baselineCount}`);

    // Verify polling with current timestamp returns hasNew = false
    const feedPollBefore = await makeRequest('GET', `/admin/live-feed?date=${today}&since=${baselineTimestamp}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(feedPollBefore.status, 200);
    assert.strictEqual(feedPollBefore.data.hasNew, false);
    console.log('  ✔ Verified: No unread sale updates prior to new transaction');

    // 3. Dealer creates a new sale in Alwar
    console.log('\n3. Alwar Dealer records a new customer sale:');
    const stockRes = await makeRequest('GET', `/inventory/district-day-stock/Alwar/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const p1 = stockRes.data.products[0];

    const newSaleRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Alwar',
        date: today,
        productId: p1.productId || p1.id,
        price: 3200,
        qty: 1,
        customerMobile: '9876543210',
        customerName: 'Live Test Customer',
        schemeName: `${p1.name} Special`
      },
      { 'Authorization': `Bearer ${dealerToken}` }
    );
    assert.strictEqual(newSaleRes.status, 201);
    const createdOrder = newSaleRes.data.order;
    console.log(`  ✔ Dealer created Order: ${createdOrder.orderNo} (${createdOrder.productName} - ₹${createdOrder.unitPrice})`);

    // 4. Admin Live Feed Poll detects instant update without delay
    console.log('\n4. Admin live-feed stream polls for changes:');
    const feedPollAfter = await makeRequest('GET', `/admin/live-feed?date=${today}&since=${baselineTimestamp}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(feedPollAfter.status, 200);
    assert.strictEqual(feedPollAfter.data.hasNew, true, 'hasNew must be true when a dealer adds a sale');
    assert.strictEqual(feedPollAfter.data.latestOrder.orderNo, createdOrder.orderNo);
    assert.strictEqual(feedPollAfter.data.latestOrder.district, 'Alwar');
    assert.strictEqual(feedPollAfter.data.latestOrder.unitPrice, 3200);
    console.log(`  ✔ Instant Update Detected! District: ${feedPollAfter.data.latestOrder.district}, Order: ${feedPollAfter.data.latestOrder.orderNo}`);

    // 5. Admin Overview displays the updated sale
    console.log('\n5. Verifying Admin Overview Matrix reflects the sale:');
    const overviewRes = await makeRequest('GET', `/admin/overview?date=${today}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(overviewRes.status, 200);
    const alwarRow = overviewRes.data.overview.find(r => r.district === 'Alwar');
    assert(alwarRow.sumSale >= 1);
    assert(alwarRow.totalSaleValue >= 3200);
    console.log(`  ✔ Admin Matrix for Alwar: Sales Count = ${alwarRow.sumSale}, Value = ₹${alwarRow.totalSaleValue}`);

    console.log('\n🎉 ZERO-DELAY REAL-TIME LIVE SALES NOTIFICATION SYSTEM IS 100% VERIFIED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
