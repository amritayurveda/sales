// test/verify_master_catalog.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3896;
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
  console.log('🚀 Running Master Product & Scheme Catalog Verification...\n');

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

    // 2. Admin creates a Master Product
    console.log('1. Admin creates a new Master Product in Catalog:');
    const createRes = await makeRequest(
      'POST',
      '/inventory/master-product',
      {
        name: 'SUPREME BALM',
        schemes: [
          { name: 'SB 1', qty: 1, price: 1800, dc: 200 },
          { name: 'SB 2', qty: 2, price: 3500, dc: 400 }
        ]
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(createRes.status, 201);
    const masterProd = createRes.data.product;
    assert.strictEqual(masterProd.name, 'SUPREME BALM');
    assert.strictEqual(masterProd.schemes.length, 2);
    console.log(`  ✔ Created Master Product "${masterProd.name}" with 2 schemes (SB 1: ₹1800, SB 2: ₹3500)`);

    // 3. Admin assigns product to Chittorgarh strictly from Master Catalog
    console.log('\n2. Admin assigns Master Product to Chittorgarh:');
    const assignRes = await makeRequest(
      'POST',
      '/inventory/assign-district-product',
      {
        district: 'Chittorgarh',
        masterProductId: masterProd.id,
        initialStock: 15
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(assignRes.status, 201);
    console.log(`  ✔ Successfully assigned "${masterProd.name}" to Chittorgarh with 15 units`);

    // 4. Chittorgarh Dealer automatically sees the product and both schemes
    console.log('\n3. Chittorgarh Dealer automatically sees the Master Product & Schemes:');
    const dealerStock = await makeRequest(
      'GET',
      '/inventory/district-day-stock/Chittorgarh/2026-08-20',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(dealerStock.status, 200);
    const prodInDist = dealerStock.data.products.find(p => p.name === 'SUPREME BALM');
    assert(prodInDist, 'SUPREME BALM must exist in Chittorgarh day stock');
    assert.strictEqual(prodInDist.schemes.length, 2, 'Dealer must automatically see all 2 schemes');
    assert.strictEqual(prodInDist.schemes[0].price, 1800);
    assert.strictEqual(prodInDist.schemes[1].price, 3500);
    console.log(`  ✔ Dealer automatically received 2 schemes for "${prodInDist.name}" with different prices`);

    // 5. Admin Renames Master Product globally
    console.log('\n4. Admin renames Master Product to "ROYAL SUPREME BALM":');
    const renameRes = await makeRequest(
      'PUT',
      `/inventory/master-product/${masterProd.id}`,
      { name: 'ROYAL SUPREME BALM' },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(renameRes.status, 200);
    console.log(`  ✔ Renamed Master Product to "${renameRes.data.product.name}"`);

    // Verify Dealer automatically sees the renamed product
    const dealerStockRenamed = await makeRequest(
      'GET',
      '/inventory/district-day-stock/Chittorgarh/2026-08-20',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    const renamedInDist = dealerStockRenamed.data.products.find(p => p.name === 'ROYAL SUPREME BALM');
    assert(renamedInDist, 'Dealer must automatically see renamed product "ROYAL SUPREME BALM"');
    console.log('  ✔ Dealer automatically sees renamed product "ROYAL SUPREME BALM"');

    // 6. Admin adds a 3rd scheme to Master Product
    console.log('\n5. Admin adds 3rd scheme "SB 3" (₹5000) to Master Product:');
    const addSchRes = await makeRequest(
      'POST',
      `/inventory/master-product/${masterProd.id}/scheme`,
      {
        action: 'ADD',
        scheme: { name: 'SB 3', qty: 3, price: 5000, dc: 500 }
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(addSchRes.status, 200);
    console.log('  ✔ Added 3rd scheme to Master Product');

    // Verify Dealer automatically sees all 3 schemes
    const dealerStock3 = await makeRequest(
      'GET',
      '/inventory/district-day-stock/Chittorgarh/2026-08-20',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    const prod3 = dealerStock3.data.products.find(p => p.name === 'ROYAL SUPREME BALM');
    assert.strictEqual(prod3.schemes.length, 3, 'Dealer must automatically see all 3 schemes');
    assert.strictEqual(prod3.schemes[2].name, 'SB 3');
    assert.strictEqual(prod3.schemes[2].price, 5000);
    console.log('  ✔ Dealer automatically sees new 3rd scheme "SB 3" (₹5000, DC ₹500)');

    // 7. Security: Attempting to assign unlisted product is blocked
    console.log('\n6. Security: Block assigning unlisted product outside Master Catalog:');
    const invalidAssign = await makeRequest(
      'POST',
      '/inventory/assign-district-product',
      { district: 'Chittorgarh', masterProductId: 'invalid_prod_999' },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(invalidAssign.status, 400, 'Must block unlisted products');
    console.log('  ✔ Unlisted product rejected with 400 Bad Request');

    console.log('\n🎉 ALL MASTER CATALOG TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
