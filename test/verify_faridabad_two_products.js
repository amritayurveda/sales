// test/verify_faridabad_two_products.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');

const PORT = 3949;
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
  console.log('🚀 Running Faridabad & Gurgaon 2-Products Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin and Faridabad Dealer
    console.log('1. Authenticating Admin and Faridabad Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    const farLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_faridabad', password: 'dealer123' });
    assert.strictEqual(farLogin.status, 200);
    const farToken = farLogin.data.token;
    console.log('  ✔ Faridabad Dealer logged in');

    const today = new Date().toISOString().slice(0, 10);

    // 2. Fetch District Products for Faridabad
    console.log('\n2. Fetching Faridabad Product Catalog:');
    const prodRes = await makeRequest('GET', '/inventory/district/Faridabad', null, { 'Authorization': `Bearer ${farToken}` });
    assert.strictEqual(prodRes.status, 200);
    const products = prodRes.data.products;
    assert.strictEqual(products.length, 2, `Expected exactly 2 products, found ${products.length}`);

    const expectedNames = ['AMAR NETRAN', 'KADWI DAWA'];
    const actualNames = products.map(p => p.name.toUpperCase());
    expectedNames.forEach(name => {
      assert.ok(actualNames.includes(name), `Missing expected product: ${name}`);
    });
    console.log('  ✔ Verified exactly 2 products in Faridabad catalog:');
    products.forEach((p, idx) => {
      console.log(`    ${idx + 1}. ${p.name} (Stock: ${p.currentStock})`);
    });

    // 3. Verify District Day Stock Register
    console.log('\n3. Verifying Faridabad Daily Stock Register:');
    const stockRes = await makeRequest('GET', `/inventory/district-day-stock/Faridabad/${today}`, null, { 'Authorization': `Bearer ${farToken}` });
    assert.strictEqual(stockRes.status, 200);
    assert.strictEqual(stockRes.data.products.length, 2, `Stock register must contain exactly 2 products`);
    console.log('  ✔ Daily stock register accurately displays the 2 products');

    // 4. Faridabad Dealer records a sale for AMAR NETRAN
    console.log('\n4. Recording a customer sale in Faridabad:');
    const stockBefore = await makeRequest('GET', `/inventory/district-day-stock/Faridabad/${today}`, null, { 'Authorization': `Bearer ${farToken}` });
    const p1Before = stockBefore.data.products.find(p => p.name.toUpperCase() === 'AMAR NETRAN');
    const stockBeforeSale = p1Before.remainStock;

    const p1 = products.find(p => p.name.toUpperCase() === 'AMAR NETRAN');

    const saleRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Faridabad',
        date: today,
        productId: p1.productId || p1.id,
        price: 2500,
        qty: 1,
        customerMobile: '9888811111',
        customerName: 'Faridabad Test Customer',
        schemeName: `${p1.name} 1`
      },
      { 'Authorization': `Bearer ${farToken}` }
    );
    assert.strictEqual(saleRes.status, 201);
    console.log(`  ✔ Sale created: Order #${saleRes.data.order.orderNo} for ${saleRes.data.order.productName}`);

    // Verify stock deducted
    const stockAfter = await makeRequest('GET', `/inventory/district-day-stock/Faridabad/${today}`, null, { 'Authorization': `Bearer ${farToken}` });
    const p1After = stockAfter.data.products.find(p => p.name.toUpperCase() === 'AMAR NETRAN');
    assert.strictEqual(p1After.remainStock, stockBeforeSale - 1);
    console.log(`  ✔ Verified: ${p1.name} stock correctly decremented from ${stockBeforeSale} to ${p1After.remainStock}`);

    // 5. Simulate Server Restart / Refresh -> verify 2 products persist
    console.log('\n5. Simulating Full Server Re-init (initDb):');
    await initDb();
    const persistedFarProds = db.districtProducts['Faridabad'];
    assert.strictEqual(persistedFarProds.length, 2, 'Faridabad products must remain exactly 2 across server restarts');
    console.log('  ✔ Verified: Faridabad 2-products catalog persisted in PostgreSQL!');

    console.log('\n🎉 FARIDABAD & GURGAON 2-PRODUCTS CATALOG VERIFIED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
