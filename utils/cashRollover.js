// utils/cashRollover.js
const { calculateDC } = require('./dcCalculator');

/**
 * Compute day-over-day rolling cash ledger for a given district up to requested date.
 * Formula:
 * Today Opening Cash = Yesterday Closing Cash
 * Today Sales Net = Sum of (Order Price - DC)
 * Total Cash Accumulated = Today Opening Cash + Today Sales Net
 * Final Closing Cash = Total Cash Accumulated - Admin Cash Paid
 *
 * @param {Object} db - Database object
 * @param {string} district - Target district
 * @param {string} targetDate - Target date (YYYY-MM-DD)
 * @returns {Object} { opCash, todaySalesNet, totalAccumulated, adminCashPaid, closingCash, allOrders, settlements }
 */
function computeDistrictDayCash(db, district, targetDate) {
  // Collect all unique dates with orders or settlements for this district
  const allOrders = (db.customerOrders || []).filter(o => o.district === district);
  const allSettlements = (db.cashSettlements || []).filter(s => s.district === district);

  const datesSet = new Set();
  allOrders.forEach(o => datesSet.add(o.date));
  allSettlements.forEach(s => datesSet.add(s.date));
  datesSet.add(targetDate);

  // Check if there is a base opening cash seeded for this district
  const baseOpeningCash = (db.baseOpeningCash && db.baseOpeningCash[district]) ? Number(db.baseOpeningCash[district]) : 0;

  const sortedDates = Array.from(datesSet).sort();

  let rollingClosing = baseOpeningCash;
  const dayResults = {};

  sortedDates.forEach(d => {
    const dayOrders = allOrders.filter(o => o.date === d);
    const daySettlements = allSettlements.filter(s => s.date === d);

    const todaySalesNet = dayOrders.reduce((sum, o) => {
      const net = (Number(o.unitPrice) || Number(o.totalAmount) || 0) - (Number(o.dcRate) || 0);
      return sum + net;
    }, 0);

    const adminCashPaid = daySettlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const opCash = rollingClosing;
    const totalAccumulated = opCash + todaySalesNet;
    const closingCash = totalAccumulated - adminCashPaid;

    dayResults[d] = {
      date: d,
      opCash,
      todaySalesNet,
      totalAccumulated,
      adminCashPaid,
      closingCash,
      orders: dayOrders,
      settlements: daySettlements
    };

    rollingClosing = closingCash;
  });

  return dayResults[targetDate] || {
    date: targetDate,
    opCash: rollingClosing,
    todaySalesNet: 0,
    totalAccumulated: rollingClosing,
    adminCashPaid: 0,
    closingCash: rollingClosing,
    orders: [],
    settlements: []
  };
}

/**
 * Compute daily stock register for all products in a district on a given date.
 * Formula:
 * Quantity (Opening) = Yesterday's Closing Stock (or base stock)
 * Sale = Sum of quantities sold in customer orders for today
 * Remain (Total 1) = Quantity - Sale
 * Mila = Received / Inward stock dispatched by Admin for today
 * Closing Stock (Total 2) = Remain + Mila
 */
function computeDistrictDayStock(db, district, targetDate) {
  const distProducts = db.districtProducts[district] || [];
  const allOrders = (db.customerOrders || []).filter(o => o.district === district);
  const milaMap = db.milaStock || {}; // keyed by `${district}:${date}:${productId}`

  // Calculate day-by-day stock
  const result = distProducts.map(p => {
    // 1. Initial base allocated stock
    const baseStock = Number(p.stockAllocated) || 0;

    // 2. Orders before today
    const ordersBefore = allOrders.filter(o => o.productId === p.productId && o.date < targetDate);
    const salesBefore = ordersBefore.reduce((sum, o) => sum + (Number(o.qty) || 0), 0);

    // Mila inward before today
    let milaBefore = 0;
    Object.keys(milaMap).forEach(key => {
      const [dist, d, pid] = key.split(':');
      if (dist === district && pid === p.productId && d < targetDate) {
        milaBefore += (Number(milaMap[key]) || 0);
      }
    });

    const openingStock = Math.round((baseStock - salesBefore + milaBefore) * 10) / 10;

    // 3. Orders today
    const ordersToday = allOrders.filter(o => o.productId === p.productId && o.date === targetDate);
    const saleQty = ordersToday.reduce((sum, o) => sum + (Number(o.qty) || 0), 0);

    // 4. Remain stock
    const remainStock = Math.round((openingStock - saleQty) * 10) / 10;

    // 5. Mila inward today
    const milaKey = `${district}:${targetDate}:${p.productId}`;
    const milaQty = Number(milaMap[milaKey]) || 0;

    // 6. Closing stock
    const closingStock = Math.round((remainStock + milaQty) * 10) / 10;

    // Dynamically resolve latest Master Product name & schemes
    const master = (db.products || []).find(mp => mp.id === p.productId || mp.name.toUpperCase() === (p.name || '').toUpperCase());
    const prodName = master ? master.name : p.name;
    const prodSchemes = (master && master.schemes && master.schemes.length > 0) ? master.schemes : (p.schemes || []);

    return {
      id: p.id,
      productId: p.productId,
      name: prodName,
      schemes: prodSchemes,
      schemePrice: p.schemePrice,
      openingStock,
      saleQty,
      remainStock,
      milaQty,
      closingStock
    };
  });

  const notesKey = `${district}:${targetDate}`;
  const inwardNote = (db.inwardNotes && db.inwardNotes[notesKey]) || '';

  return {
    district,
    date: targetDate,
    products: result,
    inwardNote
  };
}

/**
 * Compute the full chronological historical cash ledger and itemized transaction entries for a district.
 */
function computeDistrictFullCashHistory(db, district) {
  const allOrders = (db.customerOrders || []).filter(o => o.district === district);
  const allSettlements = (db.cashSettlements || []).filter(s => s.district === district);

  const datesSet = new Set();
  allOrders.forEach(o => datesSet.add(o.date));
  allSettlements.forEach(s => datesSet.add(s.date));

  const baseOpeningCash = (db.baseOpeningCash && db.baseOpeningCash[district]) ? Number(db.baseOpeningCash[district]) : 0;
  const sortedDates = Array.from(datesSet).sort();

  let rollingClosing = baseOpeningCash;
  const dailyLedger = [];
  let totalSalesLifetime = 0;
  let totalPaidLifetime = 0;

  sortedDates.forEach(d => {
    const dayOrders = allOrders.filter(o => o.date === d);
    const daySettlements = allSettlements.filter(s => s.date === d);

    const todaySalesNet = dayOrders.reduce((sum, o) => {
      const net = (Number(o.unitPrice) || Number(o.totalAmount) || 0) - (Number(o.dcRate) || 0);
      return sum + net;
    }, 0);

    const adminCashPaid = daySettlements.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const opCash = rollingClosing;
    const totalAccumulated = opCash + todaySalesNet;
    const closingCash = totalAccumulated - adminCashPaid;

    totalSalesLifetime += todaySalesNet;
    totalPaidLifetime += adminCashPaid;

    dailyLedger.push({
      date: d,
      opCash,
      todaySalesNet,
      totalAccumulated,
      adminCashPaid,
      closingCash,
      ordersCount: dayOrders.length,
      settlementsCount: daySettlements.length,
      orders: dayOrders,
      settlements: daySettlements
    });

    rollingClosing = closingCash;
  });

  // Compile all individual cash transactions
  const allTransactions = [];

  allOrders.forEach(o => {
    const net = (Number(o.unitPrice) || Number(o.totalAmount) || 0) - (Number(o.dcRate) || 0);
    allTransactions.push({
      id: o.id,
      type: 'CUSTOMER_SALE',
      date: o.date,
      time: o.time || '—',
      orderNo: o.orderNo,
      title: o.schemeName || o.productName,
      customerMobile: o.customerMobile,
      customerName: o.customerName || '',
      grossPrice: Number(o.unitPrice) || Number(o.totalAmount) || 0,
      dcDeducted: Number(o.dcRate) || 0,
      netAmount: net,
      entryType: 'INFLOW',
      timestamp: o.createdAt || `${o.date}T12:00:00.000Z`
    });
  });

  allSettlements.forEach(s => {
    allTransactions.push({
      id: s.id,
      type: 'ADMIN_COLLECTION',
      date: s.date,
      time: '—',
      orderNo: s.receiptNo,
      title: `Cash Collected (${s.paymentMode})`,
      customerMobile: '—',
      customerName: `Received by ${s.receivedBy}`,
      grossPrice: Number(s.amount) || 0,
      dcDeducted: 0,
      netAmount: -(Number(s.amount) || 0),
      note: s.note || '',
      entryType: 'OUTFLOW',
      timestamp: s.createdAt || `${s.date}T18:00:00.000Z`
    });
  });

  // Sort transactions reverse chronologically (latest first)
  allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    district,
    baseOpeningCash,
    currentClosingCash: rollingClosing,
    totals: {
      totalSalesLifetime,
      totalPaidLifetime,
      currentBalance: rollingClosing,
      daysCount: dailyLedger.length,
      transactionsCount: allTransactions.length
    },
    dailyLedger: dailyLedger.reverse(), // latest day first
    allTransactions
  };
}

module.exports = {
  computeDistrictDayCash,
  computeDistrictDayStock,
  computeDistrictFullCashHistory
};

