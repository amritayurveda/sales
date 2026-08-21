// test/verify_excel_workflow.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3892;
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
  console.log('🚀 Running Excel-Matched Dual Table & Cash Rollover Verification...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Authenticate
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(chittorLogin.status, 200);
    const chittorToken = chittorLogin.data.token;
    console.log('  ✔ Authentication successful for Admin and Chittorgarh Dealer');

    // 2. Verify 8/20/2026 Stock Register Match
    console.log('\n2. Verifying 8/20/2026 Stock Register against Excel Sheet:');
    const stockRes = await makeRequest(
      'GET',
      '/inventory/district-day-stock/Chittorgarh/2026-08-20',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(stockRes.status, 200);
    const prods = stockRes.data.products;

    // DAMADAR: Opening 8.1, Sale 3, Remain 5.1, Mila 4, Closing 9.1
    const dmd = prods.find(p => p.name === 'DAMADAR');
    assert(dmd, 'DAMADAR must exist');
    assert.strictEqual(dmd.openingStock, 8.1, 'DAMADAR opening must be 8.1');
    assert.strictEqual(dmd.saleQty, 3, 'DAMADAR sale must be 3');
    assert.strictEqual(dmd.remainStock, 5.1, 'DAMADAR remain must be 5.1');
    assert.strictEqual(dmd.milaQty, 4, 'DAMADAR mila must be 4');
    assert.strictEqual(dmd.closingStock, 9.1, 'DAMADAR closing must be 9.1');
    console.log('  ✔ DAMADAR stock verified (8.1 - 3 = 5.1 + 4 = 9.1)');

    // KADWI DAWA: Opening 7.0, Sale 2, Remain 5.0, Mila 4, Closing 9.0
    const kd = prods.find(p => p.name === 'KADWI DAWA');
    assert.strictEqual(kd.openingStock, 7.0);
    assert.strictEqual(kd.saleQty, 2);
    assert.strictEqual(kd.remainStock, 5.0);
    assert.strictEqual(kd.milaQty, 4);
    assert.strictEqual(kd.closingStock, 9.0);
    console.log('  ✔ KADWI DAWA stock verified (7.0 - 2 = 5.0 + 4 = 9.0)');

    // 3. Verify Rolling Cash Reconciliation for 8/20/2026
    console.log('\n3. Verifying Rolling Cash Reconciliation for 8/20/2026 against Excel Sheet:');
    const cashRes = await makeRequest(
      'GET',
      '/cash/daily-ledger/Chittorgarh/2026-08-20',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(cashRes.status, 200);
    const cash = cashRes.data;

    // Opening OP = 19936
    assert.strictEqual(cash.opCash, 19936, 'Opening OP cash must be ₹19,936');
    // Today Net Sales = 24176
    assert.strictEqual(cash.todaySalesNet, 24176, 'Today Net Sales must be ₹24,176');
    // Total Accumulated = 44112
    assert.strictEqual(cash.totalAccumulated, 44112, 'Total cash accumulated must be ₹44,112');
    // Admin Cash Paid = 0
    assert.strictEqual(cash.adminCashPaid, 0);
    // Closing Cash = 44112
    assert.strictEqual(cash.closingCash, 44112, 'Final closing cash must be ₹44,112');
    console.log('  ✔ Exact Excel Match: OP ₹19,936 + Today Sales ₹24,176 = Total ₹44,112 (Closing: ₹44,112)');

    // 4. Test Admin Cash Payment & Day-over-Day Rollover to Next Day (8/21/2026)
    console.log('\n4. Testing Admin Cash Payment Deduction & Rollover to 2026-08-21:');
    // Admin records cash payment of ₹14,112 collected on 8/20/2026
    const payRes = await makeRequest(
      'POST',
      '/cash/admin-payment',
      {
        district: 'Chittorgarh',
        date: '2026-08-20',
        amount: 14112,
        paymentMode: 'Cash Deposit',
        note: 'Dealer cash handover to Admin'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(payRes.status, 201);
    assert.strictEqual(payRes.data.cashLedger.closingCash, 30000, 'Closing cash for 8/20 must now be ₹30,000');
    console.log('  ✔ Admin recorded ₹14,112 payment on 8/20/2026 -> New 8/20 Closing Cash: ₹30,000');

    // Check 2026-08-21 (Next Day): OP Cash must automatically be ₹30,000!
    const nextDayCash = await makeRequest(
      'GET',
      '/cash/daily-ledger/Chittorgarh/2026-08-21',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(nextDayCash.status, 200);
    assert.strictEqual(nextDayCash.data.opCash, 30000, 'Next day OP must be ₹30,000 (Yesterday Closing)');
    console.log('  ✔ Day-Over-Day Rollover Verified: 2026-08-21 OP automatically opened at ₹30,000');

    // 5. Fast Scheme Order Creation
    console.log('\n5. Testing Fast Scheme Order Creation with Customer Mobile Number:');
    const orderRes = await makeRequest(
      'POST',
      '/orders/create-scheme-order',
      {
        district: 'Chittorgarh',
        date: '2026-08-21',
        productId: 'prod_1',
        schemeId: 'sch_dmd_1',
        customerMobile: '9898989898',
        customerName: 'Kailash Meena'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(orderRes.status, 201);
    assert.strictEqual(orderRes.data.order.unitPrice, 3052);
    assert.strictEqual(orderRes.data.order.dcRate, 250);
    assert.strictEqual(orderRes.data.order.netAmount, 2802);
    console.log('  ✔ Fast Scheme Order created: DMD 1 (Price: ₹3052, DC: ₹250, Net: ₹2802) for 9898989898');

    // 6. Security Check
    console.log('\n6. Testing Role Permissions & Security Locks:');
    const dealerIllegalPay = await makeRequest(
      'POST',
      '/cash/admin-payment',
      { district: 'Chittorgarh', date: '2026-08-21', amount: 5000 },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(dealerIllegalPay.status, 403, 'Dealer must be forbidden from cash payments/deductions');
    console.log('  ✔ Dealer blocked from adding cash payments (403 Forbidden)');

    console.log('\n🎉 ALL EXCEL WORKFLOW TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
