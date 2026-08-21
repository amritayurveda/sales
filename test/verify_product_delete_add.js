// test/verify_product_delete_add.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3894;
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
  console.log('🚀 Running District Product Add & Delete Verification...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Authenticate Admin and Dealer
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(chittorLogin.status, 200);
    const chittorToken = chittorLogin.data.token;

    // 2. Admin adds a product completely to Chittorgarh
    console.log('1. Admin adds a new product to Chittorgarh:');
    const addRes = await makeRequest(
      'POST',
      '/inventory/assign-product',
      {
        district: 'Chittorgarh',
        name: 'ROYAL HERBAL OIL',
        defaultPrice: 3200,
        initialStock: 25,
        schemeName: 'RHO 1',
        dcRate: 250
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(addRes.status, 201);
    const newProd = addRes.data.product;
    assert.strictEqual(newProd.name, 'ROYAL HERBAL OIL');
    assert.strictEqual(newProd.schemes.length, 1);
    assert.strictEqual(newProd.schemes[0].price, 3200);
    console.log(`  ✔ Successfully added "${newProd.name}" (Stock: 25, Scheme Price: ₹3200, DC: ₹250)`);

    // Verify it is in Chittorgarh day stock register
    const stockRes = await makeRequest(
      'GET',
      '/inventory/district-day-stock/Chittorgarh/2026-08-20',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(stockRes.status, 200);
    const hasNewProd = stockRes.data.products.some(p => p.name === 'ROYAL HERBAL OIL');
    assert.strictEqual(hasNewProd, true);
    console.log('  ✔ Product verified in Chittorgarh Stock Register');

    // 3. Admin deletes the product completely from Chittorgarh
    console.log('\n2. Admin deletes the product completely from Chittorgarh:');
    const delRes = await makeRequest(
      'DELETE',
      `/inventory/district/Chittorgarh/product/${newProd.productId}`,
      null,
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(delRes.status, 200);
    console.log(`  ✔ Successfully deleted product from Chittorgarh`);

    // Verify it is no longer in Chittorgarh day stock register
    const stockAfter = await makeRequest(
      'GET',
      '/inventory/district-day-stock/Chittorgarh/2026-08-20',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    const stillHas = stockAfter.data.products.some(p => p.name === 'ROYAL HERBAL OIL');
    assert.strictEqual(stillHas, false, 'Product must no longer be in Chittorgarh');
    console.log('  ✔ Product confirmed completely removed from Chittorgarh register');

    // 4. Dealer cannot add or delete products
    console.log('\n3. Verifying dealer cannot add or delete products:');
    const dealerAdd = await makeRequest(
      'POST',
      '/inventory/assign-product',
      { district: 'Chittorgarh', name: 'TEST', defaultPrice: 1000 },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(dealerAdd.status, 403, 'Dealer must be forbidden from adding products');

    const dealerDel = await makeRequest(
      'DELETE',
      '/inventory/district/Chittorgarh/product/prod_1',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(dealerDel.status, 403, 'Dealer must be forbidden from deleting products');
    console.log('  ✔ Dealer access controls verified (403 Forbidden on add & delete)');

    console.log('\n🎉 ALL PRODUCT ADD & DELETE TESTS PASSED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
