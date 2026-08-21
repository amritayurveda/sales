// test/verify_neon_postgres.js
const assert = require('assert');
const http = require('http');
const app = require('../server');
const { pool } = require('../config/postgres');

const { initDb } = require('../config/db');

const PORT = 3909;
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
  console.log('🚀 Running Neon Tech PostgreSQL Database Verification...\n');

  await initDb();
  server = app.listen(PORT);
  await new Promise(r => setTimeout(r, 600));

  try {
    // 1. Check PostgreSQL pool query
    console.log('1. Querying Neon PostgreSQL directly:');
    const pgRes = await pool.query('SELECT NOW() as current_time, current_database() as db_name;');
    assert(pgRes.rows.length > 0);
    console.log(`  ✔ Neon PostgreSQL Database: ${pgRes.rows[0].db_name}, Time: ${pgRes.rows[0].current_time}`);

    // 2. Authenticate Dealer
    console.log('\n2. Testing Authentication with PostgreSQL:');
    const chittorLogin = await makeRequest('POST', '/auth/login', { username: 'dealer_chittorgarh', password: 'dealer123' });
    assert.strictEqual(chittorLogin.status, 200);
    const chittorToken = chittorLogin.data.token;
    console.log('  ✔ Chittorgarh Dealer authenticated successfully');

    // 3. Create Sale Order
    console.log('\n3. Creating Sale Order:');
    const today = new Date().toISOString().slice(0, 10);
    const orderRes = await makeRequest(
      'POST',
      '/orders/create-order',
      {
        district: 'Chittorgarh',
        date: today,
        productId: 'prod_27', // PLAY MORE
        price: 2500,
        customerMobile: '9911223344',
        customerName: 'Postgres Test Customer'
      },
      { 'Authorization': `Bearer ${chittorToken}` }
    );
    assert.strictEqual(orderRes.status, 201);
    const order = orderRes.data.order;
    console.log(`  ✔ Order created: ${order.orderNo} for ${order.productName} (DC: ₹${order.dcRate}, Net: ₹${order.netAmount})`);

    // 4. Verify in PostgreSQL customer_orders table
    console.log('\n4. Verifying persistence in Neon PostgreSQL customer_orders table:');
    await new Promise(r => setTimeout(r, 1000));
    const orderCheck = await pool.query("SELECT * FROM customer_orders WHERE order_no = $1;", [order.orderNo]);
    assert(orderCheck.rows.length > 0, 'Created order must be in PostgreSQL customer_orders table');
    console.log(`  ✔ Verified Order ${order.orderNo} is in Neon PostgreSQL customer_orders table!`);

    console.log('\n🎉 NEON TECH POSTGRESQL DATABASE IS 100% OPERATIONAL & VERIFIED!');
    process.exit(0);
  } catch (err) {
    console.error('❌ PostgreSQL verification failed:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
  }
}

runTests();
