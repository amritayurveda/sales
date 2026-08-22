const app = require('../server');
const { initDb } = require('../config/db');
const http = require('http');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

async function testAll() {
  await initDb();
  const server = app.listen(3953);
  const token = jwt.sign({ id: 'u_admin', username: 'admin', role: 'admin', district: null }, JWT_SECRET);
  
  const districts = ['Chittorgarh', 'Alwar', 'Bikaner', 'Uttarakhand', 'Udham Singh Nagar', 'Jodhpur', 'Kota', 'Faridabad', 'Gurgaon', 'Muzaffarnagar', 'Saharanpur'];
  const date = new Date().toISOString().slice(0, 10);
  
  let failed = 0;
  for (const dist of districts) {
    const endpoints = [
      `/api/inventory/district/${encodeURIComponent(dist)}`,
      `/api/inventory/district-day-stock/${encodeURIComponent(dist)}/${date}`,
      `/api/orders/${encodeURIComponent(dist)}/${date}`,
      `/api/cash/daily-ledger/${encodeURIComponent(dist)}/${date}`,
      `/api/inventory/inward-notes/${encodeURIComponent(dist)}/${date}`,
      `/api/dc-rules/${encodeURIComponent(dist)}`
    ];
    for (const ep of endpoints) {
      await new Promise((resolve) => {
        const req = http.get({ hostname: '127.0.0.1', port: 3953, path: ep, headers: { 'Authorization': 'Bearer ' + token } }, (r) => {
          let body = '';
          r.on('data', c => body += c);
          r.on('end', () => {
            if (r.statusCode >= 400) {
              console.log('❌ FAIL:', ep, r.statusCode, body);
              failed++;
            } else {
              console.log('✔ OK:', ep, r.statusCode);
            }
            resolve();
          });
        });
        req.on('error', (e) => {
          console.error('Request error:', ep, e);
          failed++;
          resolve();
        });
      });
    }
  }
  server.close();
  if (failed > 0) {
    console.log(`\n❌ Total Failed: ${failed}`);
    process.exit(1);
  } else {
    console.log('\n🎉 ALL DISTRICT ENDPOINTS RESPONDED 200 OK!');
    process.exit(0);
  }
}
testAll().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
