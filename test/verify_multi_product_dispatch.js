// test/verify_multi_product_dispatch.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { initDb } = require('../config/db');
const { pool } = require('../config/postgres');

const PORT = 3916;
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
  console.log('🚀 Running Multi-Product & Multi-Quantity Stock Consignment Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Authenticate Admin and Alwar Dealer
    console.log('1. Authenticating Admin & Alwar Dealer:');
    const adminLogin = await makeRequest('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    assert.strictEqual(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;
    console.log('  ✔ Admin logged in');

    const dealerLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_alwar', password: 'dealer123' });
    assert.strictEqual(dealerLogin.status, 200);
    const dealerToken = dealerLogin.data.token;
    console.log('  ✔ Alwar Dealer logged in');

    // 2. Fetch Alwar Stock before dispatch
    const today = new Date().toISOString().slice(0, 10);
    const initialStockRes = await makeRequest('GET', `/inventory/district-day-stock/Alwar/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const products = initialStockRes.data.products;
    assert(products.length >= 3, 'Must have at least 3 products');

    const item1 = products[0];
    const item2 = products[1];
    const item3 = products[2];

    const initialStock1 = item1.closingStock || 0;
    const initialStock2 = item2.closingStock || 0;
    const initialStock3 = item3.closingStock || 0;

    console.log(`\n2. Initial Alwar Stock:`);
    console.log(`  - ${item1.name}: ${initialStock1} units`);
    console.log(`  - ${item2.name}: ${initialStock2} units`);
    console.log(`  - ${item3.name}: ${initialStock3} units`);

    // 3. Admin dispatches Multi-Product Consignment
    console.log('\n3. Admin Dispatches Multi-Product Consignment (3 Products, 125 Total Units) to Alwar:');
    const dispatchRes = await makeRequest(
      'POST',
      '/inventory/dispatch-stock',
      {
        district: 'Alwar',
        items: [
          { productId: item1.productId || item1.id, qty: 40 },
          { productId: item2.productId || item2.id, qty: 60 },
          { productId: item3.productId || item3.id, qty: 25 }
        ],
        challanNo: 'CH-MULT-9921',
        note: 'Combined multi-product container dispatch'
      },
      { 'Authorization': `Bearer ${adminToken}` }
    );

    assert.strictEqual(dispatchRes.status, 201);
    const transfer = dispatchRes.data.transfer;
    assert.strictEqual(transfer.status, 'PENDING_ACCEPTANCE');
    assert.strictEqual(transfer.totalUnits, 125);
    assert.strictEqual(transfer.items.length, 3);
    console.log(`  ✔ Consignment Created: ${transfer.transferNo}`);
    console.log(`    - Total Units: ${transfer.totalUnits}`);
    console.log(`    - Items Manifest: ${transfer.productName}`);

    // 4. Verify Stock has NOT increased yet before Dealer acceptance
    const midStockRes = await makeRequest('GET', `/inventory/district-day-stock/Alwar/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const midProducts = midStockRes.data.products;
    assert.strictEqual(midProducts.find(p => p.productId === item1.productId).closingStock, initialStock1, 'Stock 1 must remain unchanged in-transit');
    assert.strictEqual(midProducts.find(p => p.productId === item2.productId).closingStock, initialStock2, 'Stock 2 must remain unchanged in-transit');
    assert.strictEqual(midProducts.find(p => p.productId === item3.productId).closingStock, initialStock3, 'Stock 3 must remain unchanged in-transit');
    console.log('  ✔ Verified: All 3 products remain unchanged while In-Transit (Pending Dealer Acceptance)');

    // 5. Dealer receives and accepts the consignment
    console.log('\n4. Alwar Dealer receives and accepts the entire multi-product consignment:');
    const acceptRes = await makeRequest(
      'POST',
      `/inventory/accept-stock/${transfer.id}`,
      { date: today },
      { 'Authorization': `Bearer ${dealerToken}` }
    );
    assert.strictEqual(acceptRes.status, 200);
    console.log(`  ✔ Dealer Acceptance Response: "${acceptRes.data.message}"`);

    // 6. Verify all 3 products increased by exact dispatched quantities
    console.log('\n5. Verifying updated stock & Mila Inward for all 3 products:');
    const finalStockRes = await makeRequest('GET', `/inventory/district-day-stock/Alwar/${today}`, null, { 'Authorization': `Bearer ${dealerToken}` });
    const finalProducts = finalStockRes.data.products;

    const finalItem1 = finalProducts.find(p => p.productId === item1.productId);
    const finalItem2 = finalProducts.find(p => p.productId === item2.productId);
    const finalItem3 = finalProducts.find(p => p.productId === item3.productId);

    assert.strictEqual(finalItem1.closingStock, initialStock1 + 40, 'Product 1 stock must increase by +40');
    assert.strictEqual(finalItem2.closingStock, initialStock2 + 60, 'Product 2 stock must increase by +60');
    assert.strictEqual(finalItem3.closingStock, initialStock3 + 25, 'Product 3 stock must increase by +25');

    console.log(`  ✔ ${finalItem1.name}: New Closing Stock = ${finalItem1.closingStock} (+40 Units added, Mila = ${finalItem1.milaQty})`);
    console.log(`  ✔ ${finalItem2.name}: New Closing Stock = ${finalItem2.closingStock} (+60 Units added, Mila = ${finalItem2.milaQty})`);
    console.log(`  ✔ ${finalItem3.name}: New Closing Stock = ${finalItem3.closingStock} (+25 Units added, Mila = ${finalItem3.milaQty})`);

    // 7. Verify status in PostgreSQL database
    console.log('\n6. Verifying status in Neon PostgreSQL database:');
    const pgCheck = await pool.query('SELECT * FROM stock_transfers WHERE id = $1;', [transfer.id]);
    assert(pgCheck.rows.length > 0);
    assert.strictEqual(pgCheck.rows[0].status, 'ACCEPTED');
    assert.strictEqual(pgCheck.rows[0].received_by, 'dealer_alwar');
    assert.strictEqual(Number(pgCheck.rows[0].total_units), 125);
    console.log(`  ✔ Verified PostgreSQL record: Consignment ${transfer.transferNo} is marked ACCEPTED (Total Units: ${pgCheck.rows[0].total_units})`);

    console.log('\n🎉 MULTI-PRODUCT & MULTI-QUANTITY STOCK DISPATCH SYSTEM IS 100% VERIFIED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
