// test/inspect_postgres.js
const { pool } = require('../config/postgres');

async function inspect() {
  try {
    const res = await pool.query("SELECT key, updated_at FROM app_state");
    console.log('app_state rows:', res.rows);
    const dp = await pool.query("SELECT district, product_id, stock_allocated, current_stock FROM district_products LIMIT 20");
    console.log('district_products sample:', dp.rows);
    const ms = await pool.query("SELECT * FROM main_warehouse_stock");
    console.log('main_warehouse_stock:', ms.rows);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
inspect();
