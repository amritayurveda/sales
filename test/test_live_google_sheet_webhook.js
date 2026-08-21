// test/test_live_google_sheet_webhook.js
const { sendWebhook, PERMANENT_WEBHOOK_URL, buildDistrictSyncPayload } = require('../services/googleSheetsSync');
const { db } = require('../config/db');

async function testLiveWebhook() {
  console.log('🔗 Testing connection to user Google Apps Script Webhook:');
  console.log(`URL: ${PERMANENT_WEBHOOK_URL}\n`);

  const today = new Date().toISOString().slice(0, 10);
  const samplePayload = buildDistrictSyncPayload('Chittorgarh', today);

  console.log('Sending sync payload for Chittorgarh...');
  const res = await sendWebhook(PERMANENT_WEBHOOK_URL, samplePayload);
  console.log('Response from Google Sheets Webhook:', res);

  if (res.success) {
    console.log('\n🎉 SUCCESS: Google Sheet is receiving live data directly!');
  } else {
    console.log('\n⚠️ Note: Webhook returned:', res);
  }
  process.exit(0);
}

testLiveWebhook();
