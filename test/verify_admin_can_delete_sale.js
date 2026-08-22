// test/verify_admin_can_delete_sale.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');

const PORT = 3942;
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
  console.log('🚀 Running Admin Delete Sale Authorization & Stock Restoration Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin and Rewari Dealer
    console.log('1. Authenticating Admin and Rewari Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    const dealerLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_rewari', password: 'dealer123' });
    assert.strictEqual(dealerLogin.status, 200);
    const dealerToken = dealerLogin.data.token;
    console.log('  ✔ Rewari Dealer logged in');

    const today = new Date().toISOString().slice(0, 10);

    // 2. Dealer creates a new sale in Rewari
    console.log('\n2. Rewari Dealer creates a customer sale:');
    const stockRes = await makeRequest('GET', `/inventory/district-day-stock/Rewari/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    assert.strictEqual(stockRes.status, 200);
    const p1 = stockRes.data.products[0];
    const initialClosingStock = p1.closingStock;

    const saleRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Rewari',
        date: today,
        productId: p1.productId || p1.id,
        price: 2500,
        qty: 1,
        customerMobile: '9123456780',
        customerName: 'Delete Test Customer',
        schemeName: `${p1.name} Standard`
      },
      { 'Authorization': `Bearer ${dealerToken}` }
    );
    assert.strictEqual(saleRes.status, 201);
    const createdOrder = saleRes.data.order;
    console.log(`  ✔ Order created: #${createdOrder.orderNo} (ID: ${createdOrder.id})`);

    // 3. Dealer attempts to DELETE the order -> MUST BE BLOCKED (403)
    console.log('\n3. Dealer attempts to delete the sale order:');
    const dealerDeleteRes = await makeRequest(
      'DELETE',
      `/orders/Rewari/${today}/${createdOrder.id}`,
      null,
      { 'Authorization': `Bearer ${dealerToken}` }
    );
    assert.strictEqual(dealerDeleteRes.status, 403);
    console.log(`  ✔ Verified: Dealer deletion blocked with 403: "${dealerDeleteRes.data.error}"`);

    // 4. Admin deletes the sale order -> MUST SUCCEED (200)
    console.log('\n4. Admin deletes the sale order:');
    const adminDeleteRes = await makeRequest(
      'DELETE',
      `/orders/Rewari/${today}/${createdOrder.id}`,
      null,
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(adminDeleteRes.status, 200);
    assert.strictEqual(adminDeleteRes.data.deletedOrder.orderNo, createdOrder.orderNo);
    console.log(`  ✔ Verified: Admin successfully deleted Order #${createdOrder.orderNo}`);

    // 5. Verify order is removed from district orders and stock is restored
    console.log('\n5. Verifying removal from database and stock restoration:');
    const checkOrdersRes = await makeRequest('GET', `/orders/district/Rewari?date=${today}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(checkOrdersRes.status, 200);
    const orderExists = checkOrdersRes.data.orders.some(o => o.id === createdOrder.id || o.orderNo === createdOrder.orderNo);
    assert.strictEqual(orderExists, false, 'Order must no longer exist in district orders');
    console.log('  ✔ Verified: Order removed from live order records');

    const stockAfterRes = await makeRequest('GET', `/inventory/district-day-stock/Rewari/${today}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(stockAfterRes.status, 200);
    const p1After = stockAfterRes.data.products.find(p => p.productId === p1.productId || p.id === p1.id);
    assert.strictEqual(p1After.closingStock, initialClosingStock, 'Closing stock must be restored to initial value');
    console.log(`  ✔ Verified: Product closing stock restored to ${p1After.closingStock} units`);

    console.log('\n🎉 ADMIN DELETE SALE VERIFICATION PASSED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
