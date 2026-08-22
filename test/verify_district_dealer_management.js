// test/verify_district_dealer_management.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb, db } = require('../config/db');
const { pool } = require('../config/postgres');

const PORT = 3925;
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
  console.log('🚀 Running District & Dealer Management Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Admin Login
    console.log('1. Authenticating Admin:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    // 2. Admin Adds New District 'Ajmer'
    console.log('\n2. Admin Adds New District "Ajmer":');
    const addDistRes = await makeRequest(
      'POST',
      '/admin/add-district',
      {
        district: 'Ajmer',
        name: 'Ajmer Head Dealer',
        username: 'dealer_ajmer',
        password: 'ajmerPass123',
        dcRate: 250
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(addDistRes.status, 201);
    console.log(`  ✔ District Created: ${addDistRes.data.message}`);

    // 3. New Dealer Logs In with Credentials
    console.log('\n3. Verifying New Dealer Login (dealer_ajmer):');
    const ajmerLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_ajmer', password: 'ajmerPass123' });
    assert.strictEqual(ajmerLogin.status, 200);
    assert.strictEqual(ajmerLogin.data.user.district, 'Ajmer');
    const ajmerToken = ajmerLogin.data.token;
    console.log('  ✔ Ajmer dealer logged in successfully');

    // Verify Ajmer has default products seeded
    const today = new Date().toISOString().slice(0, 10);
    const ajmerStockRes = await makeRequest('GET', `/inventory/district-day-stock/Ajmer/${today}`, null, { 'Authorization': `Bearer ${ajmerToken}` });
    assert.strictEqual(ajmerStockRes.status, 200);
    assert(ajmerStockRes.data.products.length > 0, 'Ajmer must have seeded products');
    console.log(`  ✔ Ajmer has ${ajmerStockRes.data.products.length} products automatically configured`);

    // 4. Admin Edits Dealer Username & Password
    console.log('\n4. Admin Updates Dealer Username & Password:');
    const ajmerUserId = ajmerLogin.data.user.id;
    const updateDealerRes = await makeRequest(
      'POST',
      '/admin/update-dealer',
      {
        userId: ajmerUserId,
        username: 'dealer_ajmer_hq',
        password: 'newAjmerSecret99',
        name: 'Ajmer Regional HQ'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(updateDealerRes.status, 200);
    console.log(`  ✔ Dealer Account Updated: "${updateDealerRes.data.message}"`);

    // 5. Old Credentials Fail
    console.log('\n5. Verifying Old Credentials Rejected:');
    const oldLoginFail = await makeRequest('POST', '/auth/login', { username: 'dealer_ajmer', password: 'ajmerPass123' });
    assert.strictEqual(oldLoginFail.status, 401);
    console.log('  ✔ Old username/password correctly rejected (401 Unauthorized)');

    // 6. New Credentials Succeed
    console.log('\n6. Verifying New Credentials (dealer_ajmer_hq):');
    const newLoginSuccess = await makeRequest('POST', '/auth/login', { username: 'dealer_ajmer_hq', password: 'newAjmerSecret99' });
    assert.strictEqual(newLoginSuccess.status, 200);
    assert.strictEqual(newLoginSuccess.data.user.username, 'dealer_ajmer_hq');
    console.log('  ✔ New credentials authenticated successfully');

    // 7. Admin Deletes District 'Ajmer'
    console.log('\n7. Admin Deletes District "Ajmer":');
    const deleteDistRes = await makeRequest(
      'POST',
      '/admin/delete-district',
      { district: 'Ajmer' },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(deleteDistRes.status, 200);
    console.log(`  ✔ Deleted District: "${deleteDistRes.data.message}"`);

    // 8. Verify Dealer Account Removed
    console.log('\n8. Verifying Deleted Dealer Login Blocked:');
    const deletedLoginFail = await makeRequest('POST', '/auth/login', { username: 'dealer_ajmer_hq', password: 'newAjmerSecret99' });
    assert.strictEqual(deletedLoginFail.status, 401);
    console.log('  ✔ Deleted dealer account correctly denied login (401)');

    console.log('\n🎉 ADD/DELETE DISTRICT & EDIT DEALER LOGIN SYSTEM IS 100% VERIFIED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
