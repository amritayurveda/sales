// test/verify_special_products_dc.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3903;
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
  console.log('🚀 Running Special Products DC Verification (₹170 in UK/USN, ₹150 elsewhere)...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Authenticate Admin and District Dealers
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const ukLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_uttarakhand', password: 'dealer123' });
    const ukToken = ukLogin.data.token;

    const usnLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_udhamsingh', password: 'dealer123' });
    const usnToken = usnLogin.data.token;

    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    const chittorToken = chittorLogin.data.token;

    const alwarLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_alwar', password: 'dealer123' });
    const alwarToken = alwarLogin.data.token;

    const today = new Date().toISOString().slice(0, 10);

    // 2. Fetch Master Products list
    console.log('1. Checking Master Products presence:');
    const masterRes = await makeRequest('GET', '/inventory/master-products', null, { 'Authorization': `Bearer ${adminToken}` });
    const prods = masterRes.data.products;

    const playMore = prods.find(p => p.name === 'PLAY MORE');
    const heightVeda = prods.find(p => p.name === 'HEIGHT VEDA');
    const alergySafa = prods.find(p => p.name === 'ALERGY SAFA');
    const eyeSutra = prods.find(p => p.name === 'EYE SUTRA');

    assert(playMore, 'PLAY MORE must exist in catalog');
    assert(heightVeda, 'HEIGHT VEDA must exist in catalog');
    assert(alergySafa, 'ALERGY SAFA must exist in catalog');
    assert(eyeSutra, 'EYE SUTRA must exist in catalog');
    console.log('  ✔ Verified PLAY MORE, HEIGHT VEDA, ALERGY SAFA, EYE SUTRA in Master Catalog');

    // 3. Test PLAY MORE in Uttarakhand -> DC must be 170
    console.log('\n2. Testing PLAY MORE in Uttarakhand (DC must be ₹170):');
    const ukOrder = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Uttarakhand',
        date: today,
        productId: playMore.id,
        price: 2200,
        customerMobile: '9111111111',
        customerName: 'UK Customer'
      },
      { 'Authorization': `Bearer ${ukToken}` }
    );
    assert.strictEqual(ukOrder.status, 201);
    assert.strictEqual(ukOrder.data.order.dcRate, 170);
    assert.strictEqual(ukOrder.data.order.netAmount, 2030); // 2200 - 170
    console.log(`  ✔ Uttarakhand: PLAY MORE @ ₹2200 -> DC: ₹${ukOrder.data.order.dcRate}, Net: ₹${ukOrder.data.order.netAmount}`);

    // 4. Test HEIGHT VEDA in Udham Singh Nagar -> DC must be 170
    console.log('\n3. Testing HEIGHT VEDA in Udham Singh Nagar (DC must be ₹170):');
    const usnOrder = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Udham Singh Nagar',
        date: today,
        productId: heightVeda.id,
        price: 2500,
        customerMobile: '9222222222',
        customerName: 'USN Customer'
      },
      { 'Authorization': `Bearer ${usnToken}` }
    );
    assert.strictEqual(usnOrder.status, 201);
    assert.strictEqual(usnOrder.data.order.dcRate, 170);
    assert.strictEqual(usnOrder.data.order.netAmount, 2330); // 2500 - 170
    console.log(`  ✔ Udham Singh Nagar: HEIGHT VEDA @ ₹2500 -> DC: ₹${usnOrder.data.order.dcRate}, Net: ₹${usnOrder.data.order.netAmount}`);

    // 5. Test ALERGY SAFA in Chittorgarh -> DC must be 150
    console.log('\n4. Testing ALERGY SAFA in Chittorgarh (DC must be ₹150):');
    const chittorOrder = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Chittorgarh',
        date: today,
        productId: alergySafa.id,
        price: 1800,
        customerMobile: '9333333333',
        customerName: 'Chittor Customer'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(chittorOrder.status, 201);
    assert.strictEqual(chittorOrder.data.order.dcRate, 150);
    assert.strictEqual(chittorOrder.data.order.netAmount, 1650); // 1800 - 150
    console.log(`  ✔ Chittorgarh: ALERGY SAFA @ ₹1800 -> DC: ₹${chittorOrder.data.order.dcRate}, Net: ₹${chittorOrder.data.order.netAmount}`);

    // 6. Test EYE SUTRA in Alwar -> DC must be 150
    console.log('\n5. Testing EYE SUTRA in Alwar (DC must be ₹150):');
    const alwarOrder = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Alwar',
        date: today,
        productId: eyeSutra.id,
        price: 1200,
        customerMobile: '9444444444',
        customerName: 'Alwar Customer'
      },
      { 'Authorization': `Bearer ${alwarToken}` }
    );
    assert.strictEqual(alwarOrder.status, 201);
    assert.strictEqual(alwarOrder.data.order.dcRate, 150);
    assert.strictEqual(alwarOrder.data.order.netAmount, 1050); // 1200 - 150
    console.log(`  ✔ Alwar: EYE SUTRA @ ₹1200 -> DC: ₹${alwarOrder.data.order.dcRate}, Net: ₹${alwarOrder.data.order.netAmount}`);

    console.log('\n🎉 ALL SPECIAL PRODUCTS & DC RULES VERIFIED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
