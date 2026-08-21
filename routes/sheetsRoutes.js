// routes/sheetsRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb, logActivity, DISTRICTS } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const {
  GOOGLE_SHEET_ID,
  GOOGLE_SHEET_URL,
  syncAllDistrictsToSheets,
  buildDistrictSyncPayload,
  sendWebhook
} = require('../services/googleSheetsSync');
const { getServerToday } = require('../middleware/sameDayCheck');

// 1. Get Google Sheets Integration Status & Config
router.get('/config', authenticateToken, (req, res) => {
  const config = db.googleSheetsConfig || {
    sheetId: GOOGLE_SHEET_ID,
    sheetUrl: GOOGLE_SHEET_URL,
    webhookUrl: '',
    autoSync: true,
    lastSyncTimestamp: null
  };

  res.json({
    sheetId: GOOGLE_SHEET_ID,
    sheetUrl: GOOGLE_SHEET_URL,
    config,
    districts: DISTRICTS
  });
});

// 2. Admin: Update Google Sheets Webhook URL
router.post('/config', authenticateToken, requireAdmin, (req, res) => {
  const { webhookUrl, autoSync } = req.body;

  if (!db.googleSheetsConfig) db.googleSheetsConfig = {};
  if (webhookUrl !== undefined) db.googleSheetsConfig.webhookUrl = webhookUrl.trim();
  if (autoSync !== undefined) db.googleSheetsConfig.autoSync = Boolean(autoSync);
  db.googleSheetsConfig.sheetId = GOOGLE_SHEET_ID;
  db.googleSheetsConfig.sheetUrl = GOOGLE_SHEET_URL;

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    null,
    'SHEETS_CONFIG_UPDATE',
    `Updated Google Sheets Webhook configuration: ${webhookUrl || 'None'}`
  );

  saveDb();

  res.json({
    message: 'Google Sheets configuration updated successfully',
    config: db.googleSheetsConfig
  });
});

// 3. Admin & Dealers: Trigger Full Sync to Google Sheets
router.post('/sync-all', authenticateToken, async (req, res) => {
  const date = req.body.date || getServerToday();

  try {
    const syncRes = await syncAllDistrictsToSheets(date);
    res.json({
      message: `Sync completed for all 12 districts for ${date}`,
      syncResult: syncRes
    });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

// 4. Trigger single district sync
router.post('/sync-district', authenticateToken, async (req, res) => {
  const { district, date } = req.body;
  const targetDist = district || req.user.district;
  const targetDate = date || getServerToday();

  if (!targetDist) {
    return res.status(400).json({ error: 'District is required' });
  }

  const webhookUrl = (db.googleSheetsConfig && db.googleSheetsConfig.webhookUrl) || null;
  const payload = buildDistrictSyncPayload(targetDist, targetDate);

  if (webhookUrl) {
    const result = await sendWebhook(webhookUrl, payload);
    res.json({
      message: `District ${targetDist} synced to Google Sheets`,
      result
    });
  } else {
    res.json({
      message: `District ${targetDist} payload generated (Add Webhook URL to enable auto-push)`,
      payload
    });
  }
});

// 5. Get Google Apps Script Code Template
router.get('/script-template', authenticateToken, (req, res) => {
  const scriptCode = `/**
 * Google Apps Script Webhook for Sales Register Pro
 * Paste this in your Google Sheet (Extensions > Apps Script), then click Deploy > New Deployment > Web App.
 * Access: Anyone (even anonymous)
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var district = data.district || "CHITORGARH";
    var date = data.date || Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd");

    // 1. Find or Create District Tab
    var sheetName = district.toUpperCase();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      // Header for District Stock
      sheet.appendRow(["DATE", "PRODUCT NAME", "OPENING STOCK", "SALE QTY", "REMAIN TOTAL", "MILA (INWARD)", "CLOSING STOCK"]);
      sheet.getRange("A1:G1").setBackground("#F0DC82").setFontWeight("bold");
    }

    // 2. Write Stock Rows
    if (data.stockReport && data.stockReport.length > 0) {
      data.stockReport.forEach(function(p) {
        sheet.appendRow([date, p.name, p.opening, p.sale, p.remain, p.mila, p.closing]);
      });
    }

    // 3. Write Cash Reconciliation Summary to a "CASH_CLOSING" tab
    var cashSheet = ss.getSheetByName("CASH_CLOSING");
    if (!cashSheet) {
      cashSheet = ss.insertSheet("CASH_CLOSING");
      cashSheet.appendRow(["DATE", "DISTRICT", "OP CASH", "TODAY NET SALES", "TOTAL ACCUMULATED", "CASH PAID TO CO", "CLOSING CASH"]);
      cashSheet.getRange("A1:G1").setBackground("#FFF9D2").setFontWeight("bold");
    }
    if (data.cashClosing) {
      var c = data.cashClosing;
      cashSheet.appendRow([date, district, c.opCash, c.todaySalesNet, c.totalAccumulated, c.adminCashPaid, c.closingCash]);
    }

    // 4. Write Individual Orders to "ALL_ORDERS" tab
    if (data.orders && data.orders.length > 0) {
      var ordersSheet = ss.getSheetByName("ALL_ORDERS");
      if (!ordersSheet) {
        ordersSheet = ss.insertSheet("ALL_ORDERS");
        ordersSheet.appendRow(["DATE", "TIME", "DISTRICT", "ORDER NO", "PRODUCT", "PRICE", "DC", "NET CASH", "MOBILE", "CUSTOMER"]);
        ordersSheet.getRange("A1:J1").setBackground("#E8F5E9").setFontWeight("bold");
      }
      data.orders.forEach(function(o) {
        ordersSheet.appendRow([date, o.time, district, o.orderNo, o.product, o.price, o.dc, o.net, o.mobile, o.customer]);
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS", district: district, date: date }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  res.json({
    spreadsheetId: GOOGLE_SHEET_ID,
    spreadsheetUrl: GOOGLE_SHEET_URL,
    scriptCode
  });
});

module.exports = router;
