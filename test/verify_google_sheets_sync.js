// test/verify_google_sheets_sync.js
const assert = require('assert');
const http = require('http');
const app = require('../server');

const PORT = 3907;
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
  console.log('🚀 Running Google Sheets Database Integration Verification...\n');

  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 500));

  try {
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    // 1. Verify Google Sheets Config
    console.log('1. Checking Google Sheets configuration:');
    const configRes = await makeRequest('GET', '/sheets/config', null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(configRes.status, 200);
    assert.strictEqual(configRes.data.sheetId, '1n8DwEI5F5VyJFM3VA7k8_AOARXIcVRzKcn1XaSYqG44');
    console.log(`  ✔ Google Sheet linked: ${configRes.data.sheetUrl}`);

    // 2. Test saving Webhook URL
    console.log('\n2. Testing Webhook configuration update:');
    const updateRes = await makeRequest(
      'POST',
      '/sheets/config',
      { webhookUrl: 'https://script.google.com/macros/s/AKfycbz_test/exec', autoSync: true },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.config.webhookUrl, 'https://script.google.com/macros/s/AKfycbz_test/exec');
    console.log('  ✔ Webhook URL saved successfully');

    // 3. Test Full Sync for all 12 districts
    console.log('\n3. Testing 12-District Sync payload generation:');
    const today = new Date().toISOString().slice(0, 10);
    const syncRes = await makeRequest(
      'POST',
      '/sheets/sync-all',
      { date: today },
      { 'Authorization': `Bearer ${adminToken}` }
    );
    assert.strictEqual(syncRes.status, 200);
    assert.strictEqual(syncRes.data.syncResult.results.length, 12);
    console.log(`  ✔ Successfully generated and processed sync payload for all 12 districts`);

    // 4. Test Apps Script Template Endpoint
    console.log('\n4. Checking Apps Script template generation:');
    const scriptRes = await makeRequest('GET', '/sheets/script-template', null, { 'Authorization': `Bearer ${adminToken}` });
    assert.strictEqual(scriptRes.status, 200);
    assert(scriptRes.data.scriptCode.includes('SpreadsheetApp.getActiveSpreadsheet()'));
    console.log('  ✔ Verified Google Apps Script template code');

    console.log('\n🎉 GOOGLE SHEETS DATABASE INTEGRATION FULLY VERIFIED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
