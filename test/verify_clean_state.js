// test/verify_clean_state.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3905;
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
  console.log('🚀 Running 100% Clean State & Zero Stock/Cash Verification...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    const chittorToken = chittorLogin.data.token;

    const today = new Date().toISOString().slice(0, 10);

    // 1. Check Chittorgarh Day Stock
    console.log('1. Checking Chittorgarh Day Stock:');
    const stockRes = await makeRequest(
      'GET',
      `/inventory/district-day-stock/Chittorgarh/${today}`,
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(stockRes.status, 200);
    assert(stockRes.data.products.length > 0, 'Products must exist');

    stockRes.data.products.forEach(p => {
      assert.strictEqual(p.openingStock, 0, `Opening stock for ${p.name} must be 0`);
      assert.strictEqual(p.saleQty, 0, `Sale quantity for ${p.name} must be 0`);
      assert.strictEqual(p.milaQty, 0, `Mila quantity for ${p.name} must be 0`);
      assert.strictEqual(p.closingStock, 0, `Closing stock for ${p.name} must be 0`);
    });
    console.log(`  ✔ All ${stockRes.data.products.length} products in Chittorgarh have Opening=0, Sale=0, Mila=0, Closing=0`);

    // 2. Check Chittorgarh Cash Ledger
    console.log('\n2. Checking Chittorgarh Cash Reconciliation:');
    const cashRes = await makeRequest(
      'GET',
      `/cash/daily-ledger/Chittorgarh/${today}`,
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(cashRes.status, 200);
    assert.strictEqual(cashRes.data.opCash, 0, 'Opening cash must be 0');
    assert.strictEqual(cashRes.data.todaySalesNet, 0, 'Today sales net must be 0');
    assert.strictEqual(cashRes.data.totalAccumulated, 0, 'Total accumulated must be 0');
    assert.strictEqual(cashRes.data.adminCashPaid, 0, 'Admin cash paid must be 0');
    assert.strictEqual(cashRes.data.closingCash, 0, 'Closing cash must be 0');
    assert.strictEqual(cashRes.data.orders.length, 0, 'Customer orders must be 0');
    assert.strictEqual(cashRes.data.settlements.length, 0, 'Cash settlements must be 0');
    console.log(`  ✔ Chittorgarh Cash Reconciliation is completely ₹0 (0 orders, 0 payments)`);

    // 3. Check All-District Matrix Overview
    console.log('\n3. Checking 12-District Consolidated Overview:');
    const overviewRes = await makeRequest(
      'GET',
      `/admin/overview?date=${today}`,
      null,
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(overviewRes.status, 200);
    const totals = overviewRes.data.totals;
    assert.strictEqual(totals.totalQty, 0);
    assert.strictEqual(totals.totalSale, 0);
    assert.strictEqual(totals.totalFinal, 0);
    assert.strictEqual(totals.totalSaleValue, 0);
    assert.strictEqual(totals.totalCashDeposited, 0);
    assert.strictEqual(totals.totalLedgerBalance, 0);
    console.log(`  ✔ All 12 Districts Consolidated Totals are 100% ₹0 and 0 units`);

    console.log('\n🎉 ALL FAKE DATA CLEARED. APP IS IN 100% PRISTINE ZERO STATE!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
