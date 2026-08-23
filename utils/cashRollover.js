// utils/cashRollover.js
const { calculateDC } = require('./dcCalculator');

function getDistrictProductsSafely(db, district) {
  if (!db || !db.districtProducts) return [];
  let rawList = [];
  if (db.districtProducts[district] && Array.isArray(db.districtProducts[district])) {
    rawList = db.districtProducts[district];
  } else {
    const lower = (district || '').trim().toLowerCase();
    for (const k of Object.keys(db.districtProducts)) {
      if (k.trim().toLowerCase() === lower && Array.isArray(db.districtProducts[k])) {
        rawList = db.districtProducts[k];
        break;
      }
    }
  }

  // Deduplicate products by normalized product name so no district ever has double entries
  const seen = new Map();
  rawList.forEach(item => {
    if (!item || !item.name) return;
    const key = item.name.trim().toUpperCase();
    if (!seen.has(key)) {
      seen.set(key, item);
    } else {
      const existing = seen.get(key);
      // Prefer the entry with custom stock lock or non-zero stock
      if (item.isCustomStockLocked || (!existing.isCustomStockLocked && (Number(item.stockAllocated) || 0) > 0)) {
        seen.set(key, item);
      }
    }
  });

  return Array.from(seen.values());
}

/**
 * Compute day-over-day rolling cash ledger for a given district up to requested date.
 */
function computeDistrictDayCash(db, district, targetDate) {
  const distName = (district || '').trim();
  const allOrders = (db && db.customerOrders ? db.customerOrders : []).filter(o => (o.district || '').trim().toLowerCase() === distName.toLowerCase());
  const allSettlements = (db && db.cashSettlements ? db.cashSettlements : []).filter(s => (s.district || '').trim().toLowerCase() === distName.toLowerCase());

  const datesSet = new Set();
  allOrders.forEach(o => { if (o.date) datesSet.add(o.date); });
  allSettlements.forEach(s => { if (s.date) datesSet.add(s.date); });
  if (targetDate) datesSet.add(targetDate);

  const baseOpeningCash = (db && db.baseOpeningCash && db.baseOpeningCash[distName]) ? Number(db.baseOpeningCash[distName]) : 0;
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
 */
function computeDistrictDayStock(db, district, targetDate, onlyActive = true) {
  const distName = (district || '').trim();
  const distProducts = getDistrictProductsSafely(db, distName);
  const allOrders = (db && db.customerOrders ? db.customerOrders : []).filter(o => (o.district || '').trim().toLowerCase() === distName.toLowerCase());
  const milaMap = (db && db.milaStock) ? db.milaStock : {};
  const masterList = (db && db.products && db.products.length > 0) ? db.products : [];
  const unassignedMap = (db && db.unassignedDistrictProducts) ? db.unassignedDistrictProducts : {};

  const isUnassigned = (p) => {
    const k1 = `${distName}:${p.productId}`;
    const k2 = `${distName}:${(p.name || '').toUpperCase()}`;
    const k3 = `${distName.toLowerCase()}:${p.productId}`;
    const k4 = `${distName.toLowerCase()}:${(p.name || '').toUpperCase()}`;
    return Boolean(unassignedMap[k1] || unassignedMap[k2] || unassignedMap[k3] || unassignedMap[k4]);
  };

  const productsToCompute = onlyActive
    ? distProducts.filter(p => p.isActive !== false && !isUnassigned(p))
    : distProducts;

  const result = productsToCompute.map(p => {
    const baseStock = Number(p.stockAllocated) || 0;
    const master = masterList.find(mp => mp.id === p.productId || mp.name.toUpperCase() === (p.name || '').toUpperCase());
    const prodName = master ? master.name : p.name;
    const prodSchemes = (master && master.schemes && master.schemes.length > 0) ? master.schemes : (p.schemes || []);
    const canonicalId = master ? master.id : p.productId;

    const isMatch = (orderPid, orderPname) => {
      if (!orderPid && !orderPname) return false;
      if (orderPid && (orderPid === p.productId || orderPid === p.id || orderPid === canonicalId)) return true;
      if (orderPname && orderPname.trim().toUpperCase() === prodName.trim().toUpperCase()) return true;
      if (orderPid) {
        const orderMaster = masterList.find(m => m.id === orderPid || m.name.toUpperCase() === orderPid.toUpperCase());
        if (orderMaster && (orderMaster.id === canonicalId || orderMaster.name.toUpperCase() === prodName.trim().toUpperCase())) {
          return true;
        }
      }
      return false;
    };

    // Opening Stock calculation:
    // If the admin explicitly set and locked the stock, use baseStock directly as the opening baseline for the ledger
    let openingStock;
    if (p.isCustomStockLocked) {
      openingStock = Math.max(0, baseStock);
    } else {
      // Orders before today
      const ordersBefore = allOrders.filter(o => isMatch(o.productId, o.productName) && o.date < targetDate);
      const salesBefore = ordersBefore.reduce((sum, o) => sum + (Number(o.qty) || 0), 0);

      // Mila inward before today
      let milaBefore = 0;
      Object.keys(milaMap).forEach(key => {
        const [dist, d, pid] = key.split(':');
        if ((dist || '').trim().toLowerCase() === distName.toLowerCase() && d < targetDate) {
          if (isMatch(pid, null)) {
            milaBefore += (Number(milaMap[key]) || 0);
          }
        }
      });
      openingStock = Math.max(0, Math.round((baseStock - salesBefore + milaBefore) * 10) / 10);
    }

    // Orders today
    const ordersToday = allOrders.filter(o => isMatch(o.productId, o.productName) && o.date === targetDate);
    const saleQty = ordersToday.reduce((sum, o) => sum + (Number(o.qty) || 0), 0);

    const remainStock = Math.round((openingStock - saleQty) * 10) / 10;

    // Mila inward today
    let milaQty = 0;
    Object.keys(milaMap).forEach(key => {
      const [dist, d, pid] = key.split(':');
      if ((dist || '').trim().toLowerCase() === distName.toLowerCase() && d === targetDate) {
        if (isMatch(pid, null)) {
          milaQty += (Number(milaMap[key]) || 0);
        }
      }
    });

    const closingStock = Math.round((remainStock + milaQty) * 10) / 10;

    return {
      id: p.id,
      productId: canonicalId,
      name: prodName,
      isSpecial: Boolean(p.isSpecial || (master && master.isSpecial)),
      schemes: prodSchemes,
      schemePrice: p.schemePrice,
      openingStock,
      saleQty,
      remainStock,
      milaQty,
      closingStock,
      isCustomStockLocked: Boolean(p.isCustomStockLocked)
    };
  });

  const notesKey = `${distName}:${targetDate}`;
  const inwardNote = (db && db.inwardNotes && db.inwardNotes[notesKey]) ? db.inwardNotes[notesKey] : '';

  return {
    district: distName,
    date: targetDate,
    products: result,
    inwardNote
  };
}

/**
 * Compute the full chronological historical cash ledger and itemized transaction entries for a district.
 */
function computeDistrictFullCashHistory(db, district) {
  const distName = (district || '').trim();
  const allOrders = (db && db.customerOrders ? db.customerOrders : []).filter(o => (o.district || '').trim().toLowerCase() === distName.toLowerCase());
  const allSettlements = (db && db.cashSettlements ? db.cashSettlements : []).filter(s => (s.district || '').trim().toLowerCase() === distName.toLowerCase());

  const datesSet = new Set();
  allOrders.forEach(o => { if (o.date) datesSet.add(o.date); });
  allSettlements.forEach(s => { if (s.date) datesSet.add(s.date); });

  const baseOpeningCash = (db && db.baseOpeningCash && db.baseOpeningCash[distName]) ? Number(db.baseOpeningCash[distName]) : 0;
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

  allTransactions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return {
    district: distName,
    baseOpeningCash,
    currentClosingCash: rollingClosing,
    totals: {
      totalSalesLifetime,
      totalPaidLifetime,
      currentBalance: rollingClosing,
      daysCount: dailyLedger.length,
      transactionsCount: allTransactions.length
    },
    dailyLedger: dailyLedger.reverse(),
    allTransactions
  };
}

module.exports = {
  getDistrictProductsSafely,
  computeDistrictDayCash,
  computeDistrictDayStock,
  computeDistrictFullCashHistory
};
