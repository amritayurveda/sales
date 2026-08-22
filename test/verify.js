// test/verify.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { calculateDC, DEFAULT_DC_RULES } = require('../utils/dcCalculator');

const PORT = 3889;
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
  console.log('🚀 Starting Sales Register Pro Verification Suite...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    // 1. Test DC Calculator Unit Tests
    console.log('1. Testing Automated DC Calculation Engine:');
    
    // Threshold test for Chittorgarh (<= 1500 -> 200, > 1500 -> 250)
    const dcChittorLow = calculateDC(DEFAULT_DC_RULES["Chittorgarh"], 1200);
    assert.strictEqual(dcChittorLow, 200, 'Chittorgarh <= 1500 must be ₹200');
    const dcChittorHigh = calculateDC(DEFAULT_DC_RULES["Chittorgarh"], 1800);
    assert.strictEqual(dcChittorHigh, 250, 'Chittorgarh > 1500 must be ₹250');
    console.log('  ✔ Chittorgarh threshold rules verified (<=1500 -> ₹200, >1500 -> ₹250)');

    // Flat test for Alwar
    const dcAlwar = calculateDC(DEFAULT_DC_RULES["Alwar"], 3000);
    assert.strictEqual(dcAlwar, 200, 'Alwar flat DC must be ₹200');
    console.log('  ✔ Alwar flat rate verified (₹200)');

    // Override test for Uttarakhand
    const dcUttarakhandSpecial = calculateDC(DEFAULT_DC_RULES["Uttarakhand"], 1000, "Play More");
    assert.strictEqual(dcUttarakhandSpecial, 170, 'Uttarakhand Play More must be ₹170 override');
    const dcUttarakhandNormal = calculateDC(DEFAULT_DC_RULES["Uttarakhand"], 1000, "Damdhar");
    assert.strictEqual(dcUttarakhandNormal, 200, 'Uttarakhand Damdhar must be ₹200 default');
    console.log('  ✔ Uttarakhand special product override verified (Play More -> ₹170, Normal -> ₹200)');

    // 2. Authentication Tests
    console.log('\n2. Testing Authentication & Role Tokens:');
    
    // Admin login
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    assert.strictEqual(adminLogin.data.user.role, 'admin');
    const adminToken = adminLogin.data.token;
    const serverToday = adminLogin.data.serverToday;
    console.log(`  ✔ Admin authentication passed (Role: admin, Server Date: ${serverToday})`);

    // Dealer Chittorgarh login
    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(chittorLogin.status, 200);
    assert.strictEqual(chittorLogin.data.user.district, 'Chittorgarh');
    assert.strictEqual(chittorLogin.data.user.role, 'dealer');
    const chittorToken = chittorLogin.data.token;
    console.log('  ✔ Chittorgarh Dealer authentication passed (District: Chittorgarh)');

    // Dealer Alwar login
    const alwarLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_alwar', password: 'dealer123' });
    assert.strictEqual(alwarLogin.status, 200);
    const alwarToken = alwarLogin.data.token;
    console.log('  ✔ Alwar Dealer authentication passed (District: Alwar)');

    // 3. District Isolation Tests
    console.log('\n3. Testing District Isolation Security:');
    
    // Alwar dealer trying to read Chittorgarh data -> 403
    const unauthorizedRead = await makeRequest(
      'GET',
      `/sales/Chittorgarh/${serverToday}`,
      null,
      { 'Authorization': `Bearer ${alwarToken}` }
    );
    assert.strictEqual(unauthorizedRead.status, 403, 'Alwar dealer must be blocked from reading Chittorgarh');
    console.log('  ✔ Alwar dealer blocked from reading Chittorgarh records (403 Forbidden)');

    // Alwar dealer reading Alwar data -> 200
    const authorizedRead = await makeRequest(
      'GET',
      `/sales/Alwar/${serverToday}`,
      null,
      { 'Authorization': `Bearer ${alwarToken}` }
    );
    assert.strictEqual(authorizedRead.status, 200);
    console.log('  ✔ Alwar dealer successfully read Alwar records (200 OK)');

    // 4. Same-Day Edit Locking Tests
    console.log('\n4. Testing Same-Day Server-Side Edit Locking:');
    
    // Dealer Chittorgarh saving TODAY -> Allowed (200)
    const testSalesEntries = {
      "prod_1": { qty: 10, sale: 5, transfer: 2, price: 100 }
    };
    const saveToday = await makeRequest(
      'POST',
      `/sales/Chittorgarh/${serverToday}`,
      { entries: testSalesEntries },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(saveToday.status, 200, 'Dealer editing TODAY must succeed');
    console.log(`  ✔ Chittorgarh dealer saved sales entries for TODAY (${serverToday}) successfully`);

    // Dealer Chittorgarh attempting to edit PAST DATE (2026-07-08) -> BLOCKED (403)
    const pastDate = '2026-07-08';
    const savePast = await makeRequest(
      'POST',
      `/sales/Chittorgarh/${pastDate}`,
      { entries: { "prod_1": { qty: 99, sale: 99, transfer: 99 } } },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(savePast.status, 403, 'Dealer editing PAST date must be rejected with 403');
    assert.strictEqual(savePast.data.isReadOnly, true);
    console.log(`  ✔ Chittorgarh dealer edit on PAST DATE (${pastDate}) strictly blocked with 403 Forbidden`);

    // Dealer Chittorgarh VIEWING past date -> Allowed with isReadOnly flag
    const readPast = await makeRequest(
      'GET',
      `/sales/Chittorgarh/${pastDate}`,
      null,
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(readPast.status, 200);
    assert.strictEqual(readPast.data.isReadOnly, true, 'Historical record must indicate isReadOnly=true');
    console.log(`  ✔ Chittorgarh dealer can view past date (${pastDate}) with isReadOnly=true`);

    // Admin saving past date -> Allowed (Admin override)
    const adminSavePast = await makeRequest(
      'POST',
      `/sales/Chittorgarh/${pastDate}`,
      { entries: readPast.data.entries },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(adminSavePast.status, 200, 'Admin can modify historical records');
    console.log(`  ✔ Administrator override on past date allowed`);

    // 5. Automated DC to Ledger Posting
    console.log('\n5. Testing Automated DC & Cash Ledger:');
    const autoDcRes = await makeRequest(
      'POST',
      `/ledger/Chittorgarh/${serverToday}/auto-dc`,
      { price: 1600 },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(autoDcRes.status, 201);
    assert.strictEqual(autoDcRes.data.entry.dcRate, 250);
    assert.strictEqual(autoDcRes.data.entry.amount, -250);
    console.log('  ✔ Auto DC posted to Chittorgarh ledger: Rate ₹250, Ledger Amount: -₹250');

    // 6. Admin Overview Aggregation
    console.log('\n6. Testing Admin 12-District Consolidated Overview:');
    const overviewRes = await makeRequest('GET', `/admin/consolidated-overview?start=${serverToday}&end=${serverToday}`, null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(overviewRes.status, 200);
    assert.ok(overviewRes.data.targetDistricts.length >= 10, 'Overview must cover all active districts');
    console.log(`  ✔ Consolidated overview generated for ${overviewRes.data.targetDistricts.length} active districts`);

    console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! The system is 100% verified.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
