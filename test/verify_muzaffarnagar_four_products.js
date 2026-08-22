// test/verify_muzaffarnagar_four_products.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');

const PORT = 3947;
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
  console.log('🚀 Running Muzaffarnagar 4-Products Catalog Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin and Muzaffarnagar Dealer
    console.log('1. Authenticating Admin and Muzaffarnagar Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    const muzLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_muzaffarnagar', password: 'dealer123' });
    assert.strictEqual(muzLogin.status, 200);
    const muzToken = muzLogin.data.token;
    console.log('  ✔ Muzaffarnagar Dealer logged in');

    const today = new Date().toISOString().slice(0, 10);

    // 2. Fetch District Products for Muzaffarnagar
    console.log('\n2. Fetching Muzaffarnagar Product Catalog:');
    const prodRes = await makeRequest('GET', '/inventory/district/Muzaffarnagar', null, { 'Authorization': `Bearer ${muzToken}` });
    assert.strictEqual(prodRes.status, 200);
    const products = prodRes.data.products;
    assert.strictEqual(products.length, 4, `Expected exactly 4 products, found ${products.length}`);

    const expectedNames = ['PLAY MORE', 'FOUJI', 'EYE SUTRA', 'ALERGY'];
    const actualNames = products.map(p => p.name.toUpperCase());
    expectedNames.forEach(name => {
      assert.ok(actualNames.includes(name), `Missing expected product: ${name}`);
    });
    console.log('  ✔ Verified exactly 4 products in Muzaffarnagar catalog:');
    products.forEach((p, idx) => {
      console.log(`    ${idx + 1}. ${p.name} (Stock: ${p.currentStock})`);
    });

    // 3. Verify District Day Stock Register
    console.log('\n3. Verifying Muzaffarnagar Daily Stock Register:');
    const stockRes = await makeRequest('GET', `/inventory/district-day-stock/Muzaffarnagar/${today}`, null, { 'Authorization': `Bearer ${muzToken}` });
    assert.strictEqual(stockRes.status, 200);
    assert.strictEqual(stockRes.data.products.length, 4, `Stock register must contain exactly 4 products`);
    console.log('  ✔ Daily stock register accurately displays the 4 products');

    // 4. Muzaffarnagar Dealer records a sale for PLAY MORE
    console.log('\n4. Recording a customer sale in Muzaffarnagar:');
    const stockBefore = await makeRequest('GET', `/inventory/district-day-stock/Muzaffarnagar/${today}`, null, { 'Authorization': `Bearer ${muzToken}` });
    const p1Before = stockBefore.data.products.find(p => p.name.toUpperCase() === 'PLAY MORE');
    const stockBeforeSale = p1Before.remainStock;

    const p1 = products.find(p => p.name.toUpperCase() === 'PLAY MORE');

    const saleRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Muzaffarnagar',
        date: today,
        productId: p1.productId || p1.id,
        price: 2500,
        qty: 1,
        customerMobile: '9876501234',
        customerName: 'Muzaffarnagar Test Customer',
        schemeName: `${p1.name} 1`
      },
      { 'Authorization': `Bearer ${muzToken}` }
    );
    assert.strictEqual(saleRes.status, 201);
    console.log(`  ✔ Sale created: Order #${saleRes.data.order.orderNo} for ${saleRes.data.order.productName}`);

    // Verify stock deducted
    const stockAfter = await makeRequest('GET', `/inventory/district-day-stock/Muzaffarnagar/${today}`, null, { 'Authorization': `Bearer ${muzToken}` });
    const p1After = stockAfter.data.products.find(p => p.name.toUpperCase() === 'PLAY MORE');
    assert.strictEqual(p1After.remainStock, stockBeforeSale - 1);
    console.log(`  ✔ Verified: ${p1.name} stock correctly decremented from ${stockBeforeSale} to ${p1After.remainStock}`);

    // 5. Simulate Server Restart / Refresh -> verify 4 products persist
    console.log('\n5. Simulating Full Server Re-init (initDb):');
    await initDb();
    const persistedMuzProds = db.districtProducts['Muzaffarnagar'];
    assert.strictEqual(persistedMuzProds.length, 4, 'Muzaffarnagar products must remain exactly 4 across server restarts');
    console.log('  ✔ Verified: Muzaffarnagar 4-products catalog persisted in PostgreSQL!');

    console.log('\n🎉 MUZAFFARNAGAR 4-PRODUCTS CATALOG VERIFIED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
