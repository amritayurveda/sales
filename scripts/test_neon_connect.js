// scripts/test_neon_connect.js
const { pool, initPostgresTables } = require('../config/postgres');

async function testConnection() {
  console.log('Testing connection to Neon PostgreSQL...');
  try {
    const res = await pool.query('SELECT NOW() as current_time, version();');
    console.log('✔ Connected successfully to Neon Tech PostgreSQL!');
    console.log('Server Time:', res.rows[0].current_time);
    console.log('Version:', res.rows[0].version.split('\n')[0]);

    console.log('\nInitializing database tables...');
    await initPostgresTables();
    console.log('✔ All tables initialized on Neon PostgreSQL successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  }
}

testConnection();
