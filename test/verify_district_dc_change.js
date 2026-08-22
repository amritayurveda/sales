// test/verify_district_dc_change.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');

const PORT = 3943;
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
  console.log('🚀 Running District DC Change & Calculation Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin and Alwar Dealer
    console.log('1. Authenticating Admin and Alwar Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    const alwarLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_alwar', password: 'dealer123' });
    assert.strictEqual(alwarLogin.status, 200);
    const alwarToken = alwarLogin.data.token;
    console.log('  ✔ Alwar Dealer logged in');

    const today = new Date().toISOString().slice(0, 10);

    // 2. Admin changes Alwar DC to Flat ₹300
    console.log('\n2. Admin changes Alwar DC to Flat ₹300:');
    const updateRes = await makeRequest(
      'POST',
      '/admin/update-district-dc',
      {
        district: 'Alwar',
        rule: { type: 'flat', value: 300 }
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(updateRes.status, 200);
    console.log(`  ✔ DC updated: ${updateRes.data.message}`);

    // 3. Verify DC rules list returns updated rule
    console.log('\n3. Verifying DC rules list:');
    const listRes = await makeRequest('GET', '/admin/dc-rules', null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(listRes.status, 200);
    const alwarRule = listRes.data.dcRules.find(d => d.district === 'Alwar');
    assert.ok(alwarRule);
    assert.strictEqual(alwarRule.rule.value, 300);
    console.log(`  ✔ Verified: Alwar rule is "${alwarRule.description}"`);

    // 4. Alwar Dealer creates a new sale -> DC must be ₹300
    console.log('\n4. Alwar Dealer records a sale:');
    const prodRes = await makeRequest('GET', '/inventory/district/Alwar', null, { 'Authorization': `Bearer ${alwarToken}` });
    const p1 = prodRes.data.products[0];

    const saleRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Alwar',
        date: today,
        productId: p1.productId || p1.id,
        price: 2800,
        qty: 1,
        customerMobile: '9888877777',
        customerName: 'DC Test Customer',
        schemeName: `${p1.name} Standard`
      },
      { 'Authorization': `Bearer ${alwarToken}` }
    );
    assert.strictEqual(saleRes.status, 201);
    const order = saleRes.data.order;
    assert.strictEqual(order.dcRate, 300, 'DC Rate must be ₹300 as set by Admin');
    assert.strictEqual(order.netAmount, 2500, 'Net amount must be Price(2800) - DC(300) = 2500');
    console.log(`  ✔ Verified: Order #${order.orderNo} created with DC: ₹${order.dcRate}, Net: ₹${order.netAmount}`);

    // 5. Simulate Server Restart / Refresh -> verify DC rule persists from PostgreSQL
    console.log('\n5. Simulating Full Server Re-init (initDb):');
    await initDb();
    const persistedRule = db.dcRules['Alwar'];
    assert.ok(persistedRule);
    assert.strictEqual(persistedRule.value, 300, 'Alwar DC rule must persist across server restarts');
    console.log(`  ✔ Verified: Alwar DC rule Flat ₹300 persisted in PostgreSQL!`);

    console.log('\n🎉 DISTRICT DC CHANGE AND LIVE CALCULATION VERIFIED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ DC Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
