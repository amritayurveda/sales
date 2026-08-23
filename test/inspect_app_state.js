// test/inspect_app_state.js
const { pool } = require('../config/postgres');

async function inspectState() {
  try {
    const res = await pool.query("SELECT value FROM app_state WHERE key = 'main_state'");
    if (res.rows.length > 0) {
      const val = res.rows[0].value;
      console.log('Districts in app_state:', Object.keys(val.districtProducts || {}));
      console.log('Custom stock locks in app_state:', val.customStockLocks);
      console.log('Main warehouse stock in app_state:', val.mainWarehouseStock);
      console.log('Sample Chittorgarh:', val.districtProducts['Chittorgarh'] ? val.districtProducts['Chittorgarh'].slice(0, 3) : 'none');
      console.log('Sample Jaipur:', val.districtProducts['Jaipur'] ? val.districtProducts['Jaipur'].slice(0, 3) : 'none');
      console.log('Sample jaipur (lowercase):', val.districtProducts['jaipur'] ? val.districtProducts['jaipur'].slice(0, 3) : 'none');
    }
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

inspectState();
