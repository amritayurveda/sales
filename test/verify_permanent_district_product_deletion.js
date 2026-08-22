// test/verify_permanent_district_product_deletion.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');

const PORT = 3945;
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
  console.log('🚀 Running Permanent District Product Deletion & Anti-Auto-Restore Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin
    console.log('1. Authenticating Admin:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    // 2. Fetch Saharanpur products
    console.log('\n2. Fetching Saharanpur Product Catalog:');
    const prodRes = await makeRequest('GET', '/inventory/district/Saharanpur', null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(prodRes.status, 200);
    console.log(`  ✔ Current product count in Saharanpur: ${prodRes.data.products.length}`);

    // 3. Admin deletes ALERGY from Saharanpur
    console.log('\n3. Admin deletes "ALERGY" from Saharanpur:');
    const delRes = await makeRequest('DELETE', '/inventory/district/Saharanpur/product/ALERGY', null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(delRes.status, 200);
    console.log(`  ✔ ${delRes.data.message}`);

    // 4. Verify catalog now has 3 products
    const afterDelRes = await makeRequest('GET', '/inventory/district/Saharanpur', null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(afterDelRes.data.products.length, 3);
    const namesAfter = afterDelRes.data.products.map(p => p.name.toUpperCase());
    assert.strictEqual(namesAfter.includes('ALERGY'), false, 'ALERGY must be removed');
    console.log('  ✔ Verified: Product removed. Remaining: ' + namesAfter.join(', '));

    // 5. Simulate Server Restart / Refresh (initDb)
    console.log('\n5. Simulating Full Server Restart & Re-initialization (initDb):');
    await initDb();
    const persistedProds = db.districtProducts['Saharanpur'];
    assert.strictEqual(persistedProds.length, 3, 'District products must NOT be auto-populated back to 24 or re-added!');
    const persistedNames = persistedProds.map(p => p.name.toUpperCase());
    assert.strictEqual(persistedNames.includes('ALERGY'), false, 'Deleted product ALERGY must NOT be added back automatically');
    console.log(`  ✔ Verified: Product count remained 3 (${persistedNames.join(', ')}). No automatic re-adding occurred!`);

    // 6. Restore ALERGY so Saharanpur has the user's requested 4 products
    console.log('\n6. Restoring ALERGY back to Saharanpur:');
    persistedProds.push({
      id: 'dp_sah_4',
      productId: 'prod_alg',
      name: 'ALERGY',
      schemePrice: 2500,
      stockAllocated: 12,
      currentStock: 12,
      schemes: [{ id: 'sch_alg_1', name: 'ALERGY 1', qty: 1, price: 2500, dc: 170 }],
      isActive: true
    });
    const { saveDb } = require('../config/db');
    await saveDb();
    console.log('  ✔ Saharanpur restored to strictly 4 requested products');

    console.log('\n🎉 PERMANENT PRODUCT DELETION VERIFICATION PASSED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
