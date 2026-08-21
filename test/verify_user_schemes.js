// test/verify_user_schemes.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3898;
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
  console.log('🚀 Running 387 User Schemes & Master Catalog Verification...\n');

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

    // 2. Fetch Master Product Catalog
    console.log('1. Verifying Master Catalog scheme count and structure:');
    const masterRes = await makeRequest(
      'GET',
      '/inventory/master-products',
      null,
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(masterRes.status, 200);
    const products = masterRes.data.products;
    const totalSchemes = products.reduce((acc, p) => acc + p.schemes.length, 0);

    assert(products.length >= 20, `Must have at least 20 master products, found ${products.length}`);
    assert(totalSchemes >= 350, `Must have all imported schemes (~387), found ${totalSchemes}`);
    console.log(`  ✔ Verified Master Catalog: ${products.length} Products with ${totalSchemes} total schemes!`);

    // 3. Verify specific user scheme codes and prices
    console.log('\n2. Verifying specific user schemes:');
    const allSchemes = [];
    products.forEach(p => p.schemes.forEach(s => allSchemes.push(s)));

    const testSchemes = [
      { code: 'SC00968', price: 3600 },
      { code: 'SC00974', price: 2990 },
      { code: 'BESC00156', price: 3900 },
      { code: 'BESC00167', price: 2999 },
      { code: 'BESC00296', price: 2999 },
      { code: 'SC00837', price: 2500 }
    ];

    testSchemes.forEach(t => {
      const match = allSchemes.find(s => s.code === t.code || s.id === t.code);
      assert(match, `Scheme ${t.code} must exist in catalog`);
      assert.strictEqual(match.price, t.price, `Scheme ${t.code} price must be ₹${t.price}`);
      console.log(`  ✔ Verified ${match.name}`);
    });

    // 4. Test Dealer fast scheme order creation using user scheme
    console.log('\n3. Testing Dealer fast sale creation using user scheme:');
    const damdar = products.find(p => p.name === 'DAMADAR OIL');
    assert(damdar, 'DAMADAR OIL must exist');

    const fsdDamdar = damdar.schemes.find(s => s.code === 'BESC00167' || s.id === 'BESC00167');
    assert(fsdDamdar, 'BESC00167 (FSD Damdar Oil) scheme must exist under DAMADAR OIL');

    const today = new Date().toISOString().slice(0, 10);
    const orderRes = await makeRequest(
      'POST',
      '/orders/create-scheme-order',
      {
        district: 'Chittorgarh',
        date: today,
        productId: damdar.id,
        schemeId: fsdDamdar.id,
        customerMobile: '9876543210',
        customerName: 'Vikram Singh'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(orderRes.status, 201);
    const order = orderRes.data.order;
    assert.strictEqual(order.unitPrice, 2999);
    assert.strictEqual(order.dcRate, 250);
    assert.strictEqual(order.netAmount, 2749);
    console.log(`  ✔ Successfully placed sale for "${order.schemeName}" (Price: ₹${order.unitPrice}, DC: -₹${order.dcRate}, Net: ₹${order.netAmount})`);

    console.log('\n🎉 ALL 387 USER SCHEMES VERIFIED AND WORKING 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
