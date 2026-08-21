// test/verify_dc_and_detailed_cash.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3899;
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
  console.log('🚀 Running District DC & Detailed Cash History Verification...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Authenticate Admin and Dealers
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const alwarLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_alwar', password: 'dealer123' });
    assert.strictEqual(alwarLogin.status, 200);
    const alwarToken = alwarLogin.data.token;

    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(chittorLogin.status, 200);
    const chittorToken = chittorLogin.data.token;

    // 2. Admin retrieves all 12 District DC Rules
    console.log('1. Admin fetches District DC Rules:');
    const dcRulesRes = await makeRequest('GET', '/admin/dc-rules', null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(dcRulesRes.status, 200);
    assert.strictEqual(dcRulesRes.data.dcRules.length, 12);
    console.log(`  ✔ Successfully loaded DC rules for all 12 districts`);

    // 3. Admin changes DC for Alwar to Flat ₹300
    console.log('\n2. Admin changes DC for Alwar to Flat ₹300:');
    const updateAlwarDc = await makeRequest(
      'POST',
      '/admin/update-district-dc',
      {
        district: 'Alwar',
        rule: { type: 'flat', value: 300 }
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(updateAlwarDc.status, 200);
    assert.strictEqual(updateAlwarDc.data.rule.value, 300);
    console.log(`  ✔ Alwar DC rule updated: ${updateAlwarDc.data.description}`);

    // 4. Alwar Dealer creates sale $\to$ DC is automatically ₹300
    console.log('\n3. Testing order in Alwar with updated DC rate:');
    const masterProds = await makeRequest('GET', '/inventory/master-products', null, { 'Authorization': `Bearer ${adminToken}` });
    const prod = masterProds.data.products[0];
    const scheme = prod.schemes[0];
    const today = new Date().toISOString().slice(0, 10);

    const alwarOrderRes = await makeRequest(
      'POST',
      '/orders/create-scheme-order',
      {
        district: 'Alwar',
        date: today,
        productId: prod.id,
        schemeId: scheme.id,
        customerMobile: '9988776655',
        customerName: 'Rohit Sharma'
      },
      { 'Authorization': `Bearer ${alwarToken}` }
    );
    assert.strictEqual(alwarOrderRes.status, 201);
    assert.strictEqual(alwarOrderRes.data.order.dcRate, 300, 'DC rate must match Alwar updated ₹300');
    console.log(`  ✔ Alwar sale applied DC deduction of ₹${alwarOrderRes.data.order.dcRate} correctly`);

    // 5. Dealer views Detailed Multi-Day Cash Statement & Itemized Entries
    console.log('\n4. Testing Dealer Detailed Cash History:');
    const cashHistoryRes = await makeRequest(
      'GET',
      '/cash/district-full-history/Chittorgarh',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(cashHistoryRes.status, 200);
    const history = cashHistoryRes.data;

    assert(history.dailyLedger, 'dailyLedger must exist');
    assert(history.allTransactions, 'allTransactions must exist');
    assert(history.totals, 'totals summary must exist');

    console.log(`  ✔ Daily Historical Ledger contains ${history.dailyLedger.length} days`);
    console.log(`  ✔ Itemized Transactions list contains ${history.allTransactions.length} individual entries`);
    console.log(`  ✔ Current Closing Cash balance: ₹${history.totals.currentBalance}`);

    console.log('\n🎉 ALL DISTRICT DC & DETAILED CASH HISTORY TESTS PASSED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
