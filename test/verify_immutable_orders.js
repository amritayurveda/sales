// test/verify_immutable_orders.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb } = require('../config/db');

const PORT = 3911;
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
  console.log('🚀 Running Delivery Immutability & Dealer Delete-Block Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Dealer
    console.log('1. Authenticating Dealer:');
    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(chittorLogin.status, 200);
    const chittorToken = chittorLogin.data.token;
    console.log('  ✔ Chittorgarh Dealer logged in');

    // 2. Dealer creates a new delivery / order
    console.log('\n2. Dealer adds a new delivery order:');
    const today = new Date().toISOString().slice(0, 10);
    const orderRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Chittorgarh',
        date: today,
        productId: 'prod_27', // PLAY MORE
        price: 2500,
        customerMobile: '9888877777',
        customerName: 'Permanent Customer'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(orderRes.status, 201);
    const order = orderRes.data.order;
    console.log(`  ✔ Delivery created: ${order.orderNo} for ${order.productName}`);

    // 3. Dealer attempts to DELETE the order -> MUST BE BLOCKED (403 Forbidden)
    console.log('\n3. Testing Dealer Delete Attempt (Must be blocked 403):');
    const deleteAttempt = await makeRequest(
      'DELETE',
      `/orders/Chittorgarh/${today}/${order.id}`,
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(deleteAttempt.status, 403);
    assert(deleteAttempt.data.error.includes('cannot be deleted by dealers'));
    console.log(`  ✔ Dealer deletion blocked with 403: "${deleteAttempt.data.error}"`);

    // 4. Attempt to EDIT the order -> MUST BE BLOCKED (403 Forbidden)
    console.log('\n4. Testing Edit Attempt (Must be blocked 403):');
    const editAttempt = await makeRequest(
      'PUT',
      `/orders/${order.id}`,
      { price: 1000 },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(editAttempt.status, 403);
    assert(editAttempt.data.error.includes('cannot be edited by anyone'));
    console.log(`  ✔ Order edit blocked with 403: "${editAttempt.data.error}"`);

    console.log('\n🎉 DELIVERY IMMUTABILITY & ANTI-DELETE RULES VERIFIED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
