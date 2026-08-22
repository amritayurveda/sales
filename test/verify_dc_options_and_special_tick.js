// test/verify_dc_options_and_special_tick.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');
const { DC_OPTIONS, calculateDC } = require('../utils/dcCalculator');

const PORT = 3950;
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
  console.log('🚀 Running 7 DC Options & Special Product Tick Verification...\n');

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

    // 2. Verify all 7 DC Options are present
    console.log('\n2. Verifying 7 DC Options from API:');
    const dcRulesRes = await makeRequest('GET', '/admin/dc-rules', null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(dcRulesRes.status, 200);
    const dcOptions = dcRulesRes.data.dcOptions;
    assert.strictEqual(dcOptions.length, 7, 'Must have exactly 7 DC options');
    console.log('  ✔ Verified 7 DC Options:');
    dcOptions.forEach(opt => {
      console.log(`    [Option ${opt.num}] ${opt.label}`);
    });

    // 3. Test calculation for every option
    console.log('\n3. Testing DC Calculation for all 7 Options:');
    const standardProd = { name: 'REGULAR MEDICINE', isSpecial: false };
    const specialProd = { name: 'SPECIAL TEST PRODUCT', isSpecial: true };

    // Option 1: <=1500: 200, >1500: 250, special: 170
    const opt1 = { optionId: 'opt_1' };
    assert.strictEqual(calculateDC(opt1, 1200, standardProd), 200, 'Opt 1 <= 1500 must be 200');
    assert.strictEqual(calculateDC(opt1, 2500, standardProd), 250, 'Opt 1 > 1500 must be 250');
    assert.strictEqual(calculateDC(opt1, 2500, specialProd), 170, 'Opt 1 Special must be 170');
    console.log('  ✔ Option 1 Verified: Standard Low=₹200, High=₹250, Special=₹170');

    // Option 2: <=1500: 200, >1500: 250, special: 150
    const opt2 = { optionId: 'opt_2' };
    assert.strictEqual(calculateDC(opt2, 1200, standardProd), 200);
    assert.strictEqual(calculateDC(opt2, 2500, standardProd), 250);
    assert.strictEqual(calculateDC(opt2, 2500, specialProd), 150);
    console.log('  ✔ Option 2 Verified: Standard Low=₹200, High=₹250, Special=₹150');

    // Option 3: <=1500: 200, >1500: 270, special: 150
    const opt3 = { optionId: 'opt_3' };
    assert.strictEqual(calculateDC(opt3, 1200, standardProd), 200);
    assert.strictEqual(calculateDC(opt3, 2500, standardProd), 270);
    assert.strictEqual(calculateDC(opt3, 2500, specialProd), 150);
    console.log('  ✔ Option 3 Verified: Standard Low=₹200, High=₹270, Special=₹150');

    // Option 4: Flat 200, special: 170
    const opt4 = { optionId: 'opt_4' };
    assert.strictEqual(calculateDC(opt4, 1200, standardProd), 200);
    assert.strictEqual(calculateDC(opt4, 2500, standardProd), 200);
    assert.strictEqual(calculateDC(opt4, 2500, specialProd), 170);
    console.log('  ✔ Option 4 Verified: Standard=₹200, Special=₹170');

    // Option 5: Flat 250
    const opt5 = { optionId: 'opt_5' };
    assert.strictEqual(calculateDC(opt5, 1200, standardProd), 250);
    assert.strictEqual(calculateDC(opt5, 2500, specialProd), 250);
    console.log('  ✔ Option 5 Verified: Flat ₹250');

    // Option 6: Flat 200
    const opt6 = { optionId: 'opt_6' };
    assert.strictEqual(calculateDC(opt6, 1200, standardProd), 200);
    assert.strictEqual(calculateDC(opt6, 2500, specialProd), 200);
    console.log('  ✔ Option 6 Verified: Flat ₹200');

    // Option 7: Flat 150
    const opt7 = { optionId: 'opt_7' };
    assert.strictEqual(calculateDC(opt7, 1200, standardProd), 150);
    assert.strictEqual(calculateDC(opt7, 2500, specialProd), 150);
    console.log('  ✔ Option 7 Verified: Flat ₹150');

    // 4. Create Master Product with isSpecial=true (Tick option checked)
    console.log('\n4. Creating a Master Product with Special Tick Option:');
    const newProdRes = await makeRequest(
      'POST',
      '/inventory/master-product',
      {
        name: 'AYURVEDA SPECIAL HERB',
        defaultPrice: 3000,
        isSpecial: true
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(newProdRes.status, 201);
    assert.strictEqual(newProdRes.data.product.isSpecial, true, 'Product must be created with isSpecial=true');
    console.log('  ✔ Product "AYURVEDA SPECIAL HERB" created with Special flag = true');

    // 5. Test Toggle Special Status
    console.log('\n5. Testing Special Status Toggle:');
    const toggleRes = await makeRequest(
      'POST',
      `/inventory/master-product/${newProdRes.data.product.id}/toggle-special`,
      {},
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(toggleRes.status, 200);
    assert.strictEqual(toggleRes.data.product.isSpecial, false, 'Should toggle to false');
    console.log('  ✔ Successfully toggled to STANDARD');

    const toggleRes2 = await makeRequest(
      'POST',
      `/inventory/master-product/${newProdRes.data.product.id}/toggle-special`,
      {},
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(toggleRes2.status, 200);
    assert.strictEqual(toggleRes2.data.product.isSpecial, true, 'Should toggle back to true');
    console.log('  ✔ Successfully toggled back to SPECIAL');

    // 6. Test Admin setting Option 1 for Alwar and ordering
    console.log('\n6. Setting DC Option 1 for Alwar:');
    const setDcRes = await makeRequest(
      'POST',
      '/admin/update-district-dc',
      {
        district: 'Alwar',
        optionId: 'opt_1'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(setDcRes.status, 200);
    assert.strictEqual(setDcRes.data.optionId, 'opt_1');
    console.log('  ✔ Alwar updated to Option 1');

    console.log('\n🎉 ALL 7 DC OPTIONS & SPECIAL PRODUCT TICKING VERIFIED 100% OPERATIONAL!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
