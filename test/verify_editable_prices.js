// test/verify_editable_prices.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3901;
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
  console.log('🚀 Running Editable Prices & Direct Product Sale Verification...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Authenticate Dealer
    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(chittorLogin.status, 200);
    const chittorToken = chittorLogin.data.token;

    // 2. Fetch District Day Stock
    const today = new Date().toISOString().slice(0, 10);
    const stockRes = await makeRequest(
      'GET',
      `/inventory/district-day-stock/Chittorgarh/${today}`,
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(stockRes.status, 200);
    const damdar = stockRes.data.products.find(p => p.name === 'DAMADAR OIL');
    assert(damdar, 'DAMADAR OIL must exist');

    // 3. Create Sale 1 with custom editable price: ₹3,600
    console.log('1. Dealer adds sale for DAMADAR OIL with custom editable price ₹3,600:');
    const order1Res = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Chittorgarh',
        date: today,
        productId: damdar.productId,
        price: 3600,
        customerMobile: '9876543211',
        customerName: 'Customer A'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(order1Res.status, 201);
    const order1 = order1Res.data.order;
    assert.strictEqual(order1.unitPrice, 3600);
    assert.strictEqual(order1.dcRate, 250);
    assert.strictEqual(order1.netAmount, 3350);
    console.log(`  ✔ Order 1 created: ₹${order1.unitPrice} - DC ₹${order1.dcRate} = Net ₹${order1.netAmount}`);

    // 4. Create Sale 2 for DAMADAR OIL with custom editable price: ₹2,100
    console.log('\n2. Dealer adds another sale for DAMADAR OIL with custom price ₹2,100:');
    const order2Res = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Chittorgarh',
        date: today,
        productId: damdar.productId,
        price: 2100,
        customerMobile: '9876543212',
        customerName: 'Customer B'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(order2Res.status, 201);
    const order2 = order2Res.data.order;
    assert.strictEqual(order2.unitPrice, 2100);
    assert.strictEqual(order2.dcRate, 250);
    assert.strictEqual(order2.netAmount, 1850);
    console.log(`  ✔ Order 2 created: ₹${order2.unitPrice} - DC ₹${order2.dcRate} = Net ₹${order2.netAmount}`);

    // 5. Create Sale 3 for PEEDA BHASM with custom editable price: ₹990
    console.log('\n3. Dealer adds sale for PEEDA BHASM with custom price ₹990:');
    const peeda = stockRes.data.products.find(p => p.name === 'PEEDA BHASM');
    const order3Res = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Chittorgarh',
        date: today,
        productId: peeda.productId,
        price: 990,
        customerMobile: '9876543213',
        customerName: 'Customer C'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(order3Res.status, 201);
    const order3 = order3Res.data.order;
    assert.strictEqual(order3.unitPrice, 990);
    assert.strictEqual(order3.dcRate, 200); // <= 1500 threshold
    assert.strictEqual(order3.netAmount, 790);
    console.log(`  ✔ Order 3 created: ₹${order3.unitPrice} - DC ₹${order3.dcRate} = Net ₹${order3.netAmount}`);

    console.log('\n🎉 ALL EDITABLE PRICE & DIRECT PRODUCT TESTS PASSED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
