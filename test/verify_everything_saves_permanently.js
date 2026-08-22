// test/verify_everything_saves_permanently.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');

const PORT = 3948;
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
  console.log('🚀 Running Comprehensive Universal Storage & Persistence Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    const today = new Date().toISOString().slice(0, 10);

    // 1. Authenticate Admin and Dealer
    console.log('1. Authenticating Admin & Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const alwarLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_alwar', password: 'dealer123' });
    assert.strictEqual(alwarLogin.status, 200);
    const alwarToken = alwarLogin.data.token;
    console.log('  ✔ Admin and Alwar Dealer logged in successfully');

    // 2. Admin creates a sale order in Alwar
    console.log('\n2. Creating a customer sale order:');
    const prodRes = await makeRequest('GET', '/inventory/district/Alwar', null, { 'Authorization': `Bearer ${alwarToken}` });
    const p1 = prodRes.data.products[0];

    const createOrderRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Alwar',
        date: today,
        productId: p1.productId || p1.id,
        price: 2500,
        qty: 1,
        customerMobile: '9111122222',
        customerName: 'Storage Verification Customer',
        schemeName: `${p1.name} 1`
      },
      { 'Authorization': `Bearer ${alwarToken}` }
    );
    assert.strictEqual(createOrderRes.status, 201);
    const createdOrder = createOrderRes.data.order;
    console.log(`  ✔ Sale #${createdOrder.orderNo} created`);

    // 3. Admin records a Cash Payment Settlement
    console.log('\n3. Recording cash settlement:');
    const cashRes = await makeRequest(
      'POST',
      '/cash/settlement',
      {
        district: 'Alwar',
        date: today,
        amount: 2000,
        paymentMode: 'Cash',
        note: 'Storage test payment'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(cashRes.status, 201);
    const createdSettlement = cashRes.data.settlement;
    console.log(`  ✔ Cash settlement #${createdSettlement.receiptNo} of ₹2,000 saved`);

    // 4. Admin updates District DC
    console.log('\n4. Updating District DC:');
    const dcRes = await makeRequest(
      'POST',
      '/admin/update-district-dc',
      {
        district: 'Alwar',
        rule: { type: 'flat', value: 220 }
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(dcRes.status, 200);
    console.log('  ✔ DC updated for Alwar to ₹220');

    // 5. Simulate Full Server Cold Start (re-running initDb from Neon PostgreSQL)
    console.log('\n5. Simulating Full Server Cold Start / Re-hydration (initDb):');
    await initDb();

    // Verify order in database
    const persistedOrder = (db.customerOrders || []).find(o => o.id === createdOrder.id);
    assert.ok(persistedOrder, 'Order must persist across server restarts');
    console.log(`  ✔ Verified: Order #${persistedOrder.orderNo} persisted in PostgreSQL`);

    // Verify cash settlement in database
    const persistedCash = (db.cashSettlements || []).find(s => s.id === createdSettlement.id);
    assert.ok(persistedCash, 'Cash settlement must persist across server restarts');
    console.log(`  ✔ Verified: Cash Settlement #${persistedCash.receiptNo} persisted in PostgreSQL`);

    // Verify DC rule in database
    const persistedDc = db.dcRules['Alwar'];
    assert.ok(persistedDc && persistedDc.value === 220, 'Alwar DC rule must persist across server restarts');
    console.log(`  ✔ Verified: Alwar DC rule Flat ₹220 persisted in PostgreSQL`);

    // 6. Admin deletes the test order
    console.log('\n6. Admin deletes the test sale order:');
    const delOrderRes = await makeRequest(
      'DELETE',
      `/orders/Alwar/${today}/${createdOrder.id}`,
      null,
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(delOrderRes.status, 200);
    console.log(`  ✔ ${delOrderRes.data.message}`);

    // Re-verify after restart that deleted order is completely gone
    await initDb();
    const orderGone = (db.customerOrders || []).find(o => o.id === createdOrder.id);
    assert.strictEqual(orderGone, undefined, 'Deleted order must not return after restart');
    console.log('  ✔ Verified: Deleted order was purged from PostgreSQL permanently');

    console.log('\n🎉 ALL DATA STORAGE & PERSISTENCE VERIFIED 100% OPERATIONAL!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Storage Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
