// services/googleSheetsSync.js
const https = require('https');
const http = require('http');
const { URL } = require('url');
const { db, saveDb, logActivity, DISTRICTS } = require('../config/db');
const { computeDistrictDayStock, computeDistrictDayCash, computeDistrictFullCashHistory } = require('../utils/cashRollover');

const GOOGLE_SHEET_ID = '1n8DwEI5F5VyJFM3VA7k8_AOARXIcVRzKcn1XaSYqG44';
const GOOGLE_SHEET_URL = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/edit?usp=sharing`;

/**
 * Send payload to Google Sheets Webhook
 */
function sendWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    if (!webhookUrl) {
      return resolve({ success: false, message: 'No webhook URL configured' });
    }

    try {
      const parsedUrl = new URL(webhookUrl);
      const postData = JSON.stringify(payload);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        timeout: 8000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = client.request(options, (res) => {
        // Follow redirects (Google Apps Script web apps return 302 redirects)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return sendWebhook(res.headers.location, payload)
            .then(resolve)
            .catch(reject);
        }

        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve({ success: true, data: parsed });
          } catch (e) {
            resolve({ success: true, raw: body });
          }
        });
      });

      req.on('error', (err) => {
        console.error('Google Sheets Sync Error:', err.message);
        resolve({ success: false, error: err.message });
      });

      req.write(postData);
      req.end();
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Build consolidated sync payload for a district and date
 */
function buildDistrictSyncPayload(district, date) {
  const stock = computeDistrictDayStock(db, district, date);
  const cash = computeDistrictDayCash(db, district, date);
  const fullHistory = computeDistrictFullCashHistory(db, district);

  return {
    action: 'SYNC_DISTRICT',
    spreadsheetId: GOOGLE_SHEET_ID,
    district,
    date,
    stockReport: stock.products.map(p => ({
      name: p.name,
      opening: p.openingStock,
      sale: p.saleQty,
      remain: p.remainStock,
      mila: p.milaQty,
      closing: p.closingStock
    })),
    inwardNote: stock.inwardNote || '',
    cashClosing: {
      opCash: cash.opCash,
      todaySalesNet: cash.todaySalesNet,
      totalAccumulated: cash.totalAccumulated,
      adminCashPaid: cash.adminCashPaid,
      closingCash: cash.closingCash
    },
    orders: (cash.orders || []).map(o => ({
      orderNo: o.orderNo,
      product: o.productName,
      price: o.unitPrice,
      dc: o.dcRate,
      net: o.netAmount,
      mobile: o.customerMobile,
      customer: o.customerName || '',
      time: o.time || ''
    })),
    settlements: (cash.settlements || []).map(s => ({
      receiptNo: s.receiptNo,
      amount: s.amount,
      mode: s.paymentMode,
      receivedBy: s.receivedBy,
      note: s.note || ''
    })),
    totals: fullHistory.totals
  };
}

/**
 * Sync all 12 districts for a date
 */
async function syncAllDistrictsToSheets(date) {
  const webhookUrl = (db.googleSheetsConfig && db.googleSheetsConfig.webhookUrl) || null;
  const results = [];

  for (const dist of DISTRICTS) {
    const payload = buildDistrictSyncPayload(dist, date);
    if (webhookUrl) {
      const res = await sendWebhook(webhookUrl, payload);
      results.push({ district: dist, success: res.success });
    } else {
      results.push({ district: dist, status: 'Queued (Awaiting Webhook URL)' });
    }
  }

  // Update sync timestamp in db
  if (!db.googleSheetsConfig) db.googleSheetsConfig = {};
  db.googleSheetsConfig.lastSyncTimestamp = new Date().toISOString();
  db.googleSheetsConfig.lastSyncDate = date;
  saveDb();

  return {
    spreadsheetId: GOOGLE_SHEET_ID,
    spreadsheetUrl: GOOGLE_SHEET_URL,
    date,
    results,
    syncedAt: db.googleSheetsConfig.lastSyncTimestamp
  };
}

/**
 * Trigger sync on live events (order added, cash payment, stock edit)
 */
async function triggerLiveEventSync(district, date, eventType, eventData) {
  const webhookUrl = (db.googleSheetsConfig && db.googleSheetsConfig.webhookUrl) || null;
  if (!webhookUrl) return;

  const payload = {
    action: 'LIVE_EVENT',
    spreadsheetId: GOOGLE_SHEET_ID,
    district,
    date,
    eventType,
    eventData,
    districtData: buildDistrictSyncPayload(district, date)
  };

  sendWebhook(webhookUrl, payload).catch(err => console.error('Live Sync Error:', err));
}

module.exports = {
  GOOGLE_SHEET_ID,
  GOOGLE_SHEET_URL,
  buildDistrictSyncPayload,
  syncAllDistrictsToSheets,
  triggerLiveEventSync,
  sendWebhook
};
