// test/verify_adv_logics.js
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
  console.log('🚀 Running Advanced Logics Verification Suite...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Authenticate Admin and Dealers
    console.log('1. Authenticating Admin and Dealer...');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    const serverToday = adminLogin.data.serverToday;

    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(chittorLogin.status, 200);
    const chittorToken = chittorLogin.data.token;

    const alwarLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_alwar', password: 'dealer123' });
    assert.strictEqual(alwarLogin.status, 200);
    const alwarToken = alwarLogin.data.token;
    console.log('  ✔ Authentication successful for Admin, Chittorgarh Dealer, and Alwar Dealer');

    // 2. District-Specific Product Management
    console.log('\n2. Testing District-Specific Product Isolation & Management:');
    // Admin adds a special product ONLY to Chittorgarh
    const addProdRes = await makeRequest(
      'POST',
      '/inventory/assign-product',
      {
        district: 'Chittorgarh',
        name: 'Chittor Special Tonic',
        defaultPrice: 850,
        initialStock: 100
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(addProdRes.status, 201);
    const specialProd = addProdRes.data.product;
    console.log(`  ✔ Admin assigned "${specialProd.name}" to Chittorgarh with ₹850 scheme price & 100 stock`);

    // Verify Chittorgarh dealer CAN see this product
    const chittorInv = await makeRequest(
      'GET',
      '/inventory/district/Chittorgarh',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(chittorInv.status, 200);
    const chittorHasIt = chittorInv.data.products.some(p => p.name === 'Chittor Special Tonic');
    assert.strictEqual(chittorHasIt, true, 'Chittorgarh catalog must contain Chittor Special Tonic');
    console.log('  ✔ Chittorgarh dealer catalog contains "Chittor Special Tonic"');

    // Verify Alwar dealer CANNOT see this product
    const alwarInv = await makeRequest(
      'GET',
      '/inventory/district/Alwar',
      null,
      { 'Authorization': `Bearer ${alwarToken}` }
    );
    assert.strictEqual(alwarInv.status, 200);
    const alwarHasIt = alwarInv.data.products.some(p => p.name === 'Chittor Special Tonic');
    assert.strictEqual(alwarHasIt, false, 'Alwar catalog must NOT contain Chittor Special Tonic');
    console.log('  ✔ Alwar dealer catalog isolated (does NOT have Chittor Special Tonic)');

    // 3. Stock Inward Dispatch by Admin
    console.log('\n3. Testing Admin Inward Stock Dispatch:');
    const inwardRes = await makeRequest(
      'POST',
      '/inventory/add-stock',
      {
        district: 'Chittorgarh',
        productId: specialProd.productId,
        quantity: 50,
        note: 'Fresh consignment arrived'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(inwardRes.status, 200);
    assert.strictEqual(inwardRes.data.stockAfter, 150, 'Stock must increase from 100 to 150');
    console.log(`  ✔ Admin dispatched +50 units to Chittorgarh (Stock: 100 -> 150)`);

    // 4. Customer Sale with Mobile Number & Stock Auto-Subtraction
    console.log('\n4. Testing Customer Sale with Mobile Number & Auto-Deduction:');
    const saleOrderRes = await makeRequest(
      'POST',
      '/orders/create',
      {
        district: 'Chittorgarh',
        date: serverToday,
        productId: specialProd.productId,
        quantity: 5,
        unitPrice: 850,
        customerMobile: '9876543210',
        customerName: 'Rajesh Sharma',
        note: 'Urgent Home Delivery'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(saleOrderRes.status, 201);
    assert.strictEqual(saleOrderRes.data.remainingStock, 145, 'Stock must decrease from 150 to 145');
    assert.strictEqual(saleOrderRes.data.order.customerMobile, '9876543210');
    assert.strictEqual(saleOrderRes.data.order.totalAmount, 5 * 850);
    console.log(`  ✔ Customer sale logged: 5 units sold to Rajesh Sharma [9876543210] (Amount: ₹4,250, Remaining Stock: 145)`);

    // 5. Cash Management & Admin-Only Settlement Deduction
    console.log('\n5. Testing Cash Management & Admin-Only Deduction:');
    // Cash summary check
    const cashSumBefore = await makeRequest(
      'GET',
      '/cash/summary/Chittorgarh',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(cashSumBefore.status, 200);
    assert.strictEqual(cashSumBefore.data.allTime.totalCashGenerated >= 4250, true);
    const initialDue = cashSumBefore.data.allTime.outstandingCashDue;
    console.log(`  ✔ Cash generated verified: Outstanding due is ₹${initialDue}`);

    // Dealer attempts to deduct/settle cash directly -> 403 Forbidden
    const dealerIllegalSettle = await makeRequest(
      'POST',
      '/cash/admin-settlement',
      { district: 'Chittorgarh', amount: 2000 },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(dealerIllegalSettle.status, 403, 'Dealer must be forbidden from cash settlements');
    console.log('  ✔ Dealer blocked from deducting company cash (403 Forbidden)');

    // Admin records official cash settlement from dealer
    const adminSettleRes = await makeRequest(
      'POST',
      '/cash/admin-settlement',
      {
        district: 'Chittorgarh',
        amount: 4250,
        paymentMode: 'Bank Transfer',
        note: 'Dealer NEFT Payment Ref #88921'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(adminSettleRes.status, 201);
    assert.strictEqual(adminSettleRes.data.settlement.amount, 4250);
    console.log(`  ✔ Admin recorded cash settlement of ₹4,250 (Receipt: ${adminSettleRes.data.settlement.receiptNo})`);

    // Verify outstanding cash due decreased
    const cashSumAfter = await makeRequest(
      'GET',
      '/cash/summary/Chittorgarh',
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(cashSumAfter.data.allTime.outstandingCashDue, initialDue - 4250);
    console.log(`  ✔ Outstanding cash due successfully subtracted by Admin: ₹${initialDue} -> ₹${cashSumAfter.data.allTime.outstandingCashDue}`);

    // 6. User Activity Monitoring
    console.log('\n6. Testing Live User Activity Stream:');
    const activityRes = await makeRequest(
      'GET',
      '/admin/activity-logs?limit=10',
      null,
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(activityRes.status, 200);
    assert.strictEqual(activityRes.data.activityLogs.length > 0, true);
    const hasSaleAct = activityRes.data.activityLogs.some(a => a.action === 'CUSTOMER_SALE');
    const hasSettleAct = activityRes.data.activityLogs.some(a => a.action === 'CASH_SETTLEMENT');
    assert.strictEqual(hasSaleAct, true, 'Activity log must record customer sales');
    assert.strictEqual(hasSettleAct, true, 'Activity log must record cash settlements');
    console.log(`  ✔ Live Activity Stream verified (${activityRes.data.activityLogs.length} events logged, capturing logins, sales, and settlements)`);

    console.log('\n🎉 ALL ADVANCED LOGICS TESTS PASSED WITH 100% SUCCESS!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
