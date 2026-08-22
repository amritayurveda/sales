// routes/inventoryRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb, logActivity } = require('../config/db');
const { pool } = require('../config/postgres');
const { authenticateToken, requireAdmin, enforceDistrictAccess } = require('../middleware/auth');
const { computeDistrictDayStock } = require('../utils/cashRollover');

// 1. Get complete Daily Stock Register matching Excel table for a district and date
router.get('/district-day-stock/:district/:date', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district, date } = req.params;
  const dayStock = computeDistrictDayStock(db, district, date);
  res.json(dayStock);
});

// 2. Get raw district products and schemes
router.get('/district/:district', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district } = req.params;
  const items = db.districtProducts[district] || [];
  // Populate latest master info
  const populated = items.map(p => {
    const master = (db.products || []).find(mp => mp.id === p.productId || mp.name.toUpperCase() === (p.name || '').toUpperCase());
    return {
      ...p,
      name: master ? master.name : p.name,
      schemes: (master && master.schemes) ? master.schemes : (p.schemes || [])
    };
  });
  res.json({ district, products: populated });
});

// ================= MASTER PRODUCT & SCHEME CATALOG (ADMIN ONLY) =================

// 3. Get all Master Products with their Schemes & Prices
router.get('/master-products', authenticateToken, (req, res) => {
  res.json({ products: db.products || [] });
});

// 4. Admin: Add a new Master Product
// 4. Admin: Create New Master Product with Multiple Schemes and isSpecial Flag
router.post('/master-product', authenticateToken, requireAdmin, async (req, res) => {
  const { name, schemes, defaultPrice, isSpecial } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Product name is required' });
  }

  const { isSpecialProduct } = require('../utils/dcCalculator');
  const cleanName = name.trim().toUpperCase();
  const existing = (db.products || []).find(p => p.name.toUpperCase() === cleanName);
  if (existing) {
    return res.status(400).json({ error: `Product "${cleanName}" already exists in Master Catalog` });
  }

  const prodId = 'prod_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const initialSchemes = (schemes && Array.isArray(schemes) && schemes.length > 0) ? schemes.map((s, idx) => ({
    id: `sch_${prodId}_${idx + 1}`,
    name: s.name || `${cleanName} ${idx + 1}`,
    qty: Number(s.qty) || 1,
    price: Number(s.price) || 2500,
    dc: Number(s.dc) || 250
  })) : [
    {
      id: `sch_${prodId}_1`,
      name: `${cleanName} 1`,
      qty: 1,
      price: Number(defaultPrice) || 2500,
      dc: 250
    }
  ];

  const productIsSpecial = (isSpecial !== undefined) ? Boolean(isSpecial) : isSpecialProduct(cleanName);

  const newMaster = {
    id: prodId,
    name: cleanName,
    isSpecial: productIsSpecial,
    defaultPrice: initialSchemes[0].price,
    schemes: initialSchemes
  };

  if (!db.products) db.products = [];
  db.products.push(newMaster);

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    null,
    'MASTER_PRODUCT_CREATED',
    `Created Master Product "${cleanName}" (${productIsSpecial ? 'SPECIAL' : 'STANDARD'}) with ${initialSchemes.length} schemes`
  );

  await saveDb();
  res.status(201).json({ message: `Master Product "${cleanName}" created successfully`, product: newMaster });
});

// 5. Admin: Rename / Edit Master Product (updates everywhere across all districts)
router.put('/master-product/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, isSpecial } = req.body;

  const master = (db.products || []).find(p => p.id === id);
  if (!master) {
    return res.status(404).json({ error: 'Master product not found' });
  }

  const oldName = master.name;
  if (name && name.trim()) {
    master.name = name.trim().toUpperCase();
  }

  if (isSpecial !== undefined) {
    master.isSpecial = Boolean(isSpecial);
  }

  // Propagate changes to all district assignments
  Object.keys(db.districtProducts || {}).forEach(dist => {
    db.districtProducts[dist].forEach(p => {
      if (p.productId === id || p.name.toUpperCase() === oldName.toUpperCase()) {
        p.name = master.name;
        if (isSpecial !== undefined) {
          p.isSpecial = master.isSpecial;
        }
      }
    });
  });

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    null,
    'MASTER_PRODUCT_UPDATED',
    `Updated master product "${oldName}" -> "${master.name}" (Special: ${master.isSpecial})`
  );

  await saveDb();
  res.json({ message: `Product "${master.name}" updated globally`, product: master });
});

// 5.1 Admin: Toggle Special Product Status
router.post('/master-product/:id/toggle-special', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const master = (db.products || []).find(p => p.id === id);
  if (!master) {
    return res.status(404).json({ error: 'Master product not found' });
  }

  master.isSpecial = !master.isSpecial;

  // Propagate to district products
  Object.keys(db.districtProducts || {}).forEach(dist => {
    db.districtProducts[dist].forEach(p => {
      if (p.productId === id || p.name.toUpperCase() === master.name.toUpperCase()) {
        p.isSpecial = master.isSpecial;
      }
    });
  });

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    null,
    'MASTER_PRODUCT_SPECIAL_TOGGLE',
    `Set Special=${master.isSpecial} for "${master.name}"`
  );

  await saveDb();
  res.json({
    message: `Product "${master.name}" is now marked as ${master.isSpecial ? 'SPECIAL' : 'STANDARD'}`,
    product: master
  });
});

// 6. Admin: Manage Schemes for Master Product (Add / Edit / Delete) -> propagates to every dealer automatically
router.post('/master-product/:id/scheme', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { action, scheme } = req.body;
  // action: 'ADD' | 'UPDATE' | 'DELETE'

  const master = (db.products || []).find(p => p.id === id);
  if (!master) {
    return res.status(404).json({ error: 'Master product not found' });
  }

  if (!master.schemes) master.schemes = [];

  if (action === 'ADD') {
    const newScheme = {
      id: 'sch_' + id + '_' + Date.now().toString(36),
      name: scheme.name ? scheme.name.trim() : `${master.name} ${master.schemes.length + 1}`,
      qty: Number(scheme.qty) || 1,
      price: Number(scheme.price) || 2500,
      dc: Number(scheme.dc) !== undefined ? Number(scheme.dc) : 250
    };
    master.schemes.push(newScheme);
    logActivity(req.user.id, req.user.username, req.user.role, null, 'MASTER_SCHEME_ADD', `Added scheme "${newScheme.name}" (Price: ₹${newScheme.price}) to ${master.name}`);
  } else if (action === 'UPDATE') {
    const target = master.schemes.find(s => s.id === scheme.id);
    if (!target) return res.status(404).json({ error: 'Scheme not found' });
    target.name = scheme.name ? scheme.name.trim() : target.name;
    target.qty = Number(scheme.qty) || target.qty;
    target.price = Number(scheme.price) || target.price;
    target.dc = Number(scheme.dc) !== undefined ? Number(scheme.dc) : target.dc;
    logActivity(req.user.id, req.user.username, req.user.role, null, 'MASTER_SCHEME_UPDATE', `Updated scheme "${target.name}" on ${master.name}: Price ₹${target.price}, DC ₹${target.dc}`);
  } else if (action === 'DELETE') {
    master.schemes = master.schemes.filter(s => s.id !== scheme.id);
    logActivity(req.user.id, req.user.username, req.user.role, null, 'MASTER_SCHEME_DELETE', `Deleted scheme from ${master.name}`);
  }

  await saveDb();
  res.json({ message: 'Master product schemes updated', product: master });
});

// 7. Admin: Delete Master Product
router.delete('/master-product/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const idx = (db.products || []).findIndex(p => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Master product not found' });
  }

  const removed = db.products.splice(idx, 1)[0];

  // Remove from all district assignments
  Object.keys(db.districtProducts || {}).forEach(dist => {
    db.districtProducts[dist] = db.districtProducts[dist].filter(p => p.productId !== id && p.name.toUpperCase() !== removed.name.toUpperCase());
  });

  logActivity(req.user.id, req.user.username, req.user.role, null, 'MASTER_PRODUCT_DELETED', `Deleted master product "${removed.name}" globally`);

  await saveDb();
  res.json({ message: `Master product "${removed.name}" deleted from catalog` });
});

// ================= DISTRICT ALLOCATION (STRICTLY FROM MASTER LIST) =================

// 8. Admin: Assign Master Product to a District
router.post('/assign-district-product', authenticateToken, requireAdmin, async (req, res) => {
  const { district, masterProductId, initialStock } = req.body;

  if (!district || !masterProductId) {
    return res.status(400).json({ error: 'District and masterProductId are required' });
  }

  const master = (db.products || []).find(p => p.id === masterProductId);
  if (!master) {
    return res.status(400).json({ error: 'Invalid product! Products can only be assigned from the Master Product Catalog.' });
  }

  if (!db.districtProducts[district]) {
    db.districtProducts[district] = [];
  }

  const existing = db.districtProducts[district].find(p => p.productId === master.id || p.name.toUpperCase() === master.name.toUpperCase());
  if (existing) {
    return res.status(400).json({ error: `Product "${master.name}" is already assigned to ${district}` });
  }

  const stockNum = Number(initialStock) || 0;
  const newDistrictProduct = {
    id: `dp_${district.toLowerCase().slice(0, 3)}_${master.id}`,
    productId: master.id,
    name: master.name,
    isSpecial: master.isSpecial !== undefined ? Boolean(master.isSpecial) : false,
    schemePrice: (master.schemes && master.schemes[0]) ? master.schemes[0].price : master.defaultPrice,
    stockAllocated: stockNum,
    currentStock: stockNum,
    schemes: master.schemes || [],
    isActive: true
  };

  db.districtProducts[district].push(newDistrictProduct);

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'PRODUCT_ASSIGNED',
    `Assigned master product "${master.name}" to ${district} with initial stock ${stockNum}`
  );

  await saveDb();
  res.status(201).json({ message: `Assigned "${master.name}" to ${district}`, product: newDistrictProduct });
});

// 9. Admin: Delete Product assignment from a district (Permanent Removal)
router.delete('/district/:district/product/:productId', authenticateToken, requireAdmin, async (req, res) => {
  const { district, productId } = req.params;
  
  if (!db.districtProducts) db.districtProducts = {};
  if (!db.districtProducts[district]) {
    return res.status(404).json({ error: 'District not found' });
  }

  const cleanProdId = (productId || '').trim();

  const removedProds = db.districtProducts[district].filter(p => 
    p.productId === cleanProdId || 
    p.id === cleanProdId || 
    p.name.toUpperCase() === cleanProdId.toUpperCase()
  );

  if (removedProds.length === 0) {
    return res.status(404).json({ error: 'Product not found in this district' });
  }

  const removedName = removedProds[0].name;

  // Filter out the product completely
  db.districtProducts[district] = db.districtProducts[district].filter(p => 
    p.productId !== cleanProdId && 
    p.id !== cleanProdId && 
    p.name.toUpperCase() !== cleanProdId.toUpperCase()
  );

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'PRODUCT_DELETED',
    `Permanently removed product "${removedName}" from ${district}`
  );

  await saveDb();

  res.json({
    message: `Product '${removedName}' permanently removed from ${district}`,
    remainingProducts: db.districtProducts[district]
  });
});

// 10. Admin: Edit Base Stock for a Product in a District
router.post('/adjust-base-stock', authenticateToken, requireAdmin, async (req, res) => {
  const { district, productId, newStock } = req.body;
  const numStock = Number(newStock);
  if (!district || !productId || isNaN(numStock) || numStock < 0) {
    return res.status(400).json({ error: 'Valid positive stock number required' });
  }

  const items = db.districtProducts[district] || [];
  const item = items.find(p => p.productId === productId || p.id === productId);
  if (!item) {
    return res.status(404).json({ error: 'Product not found in this district' });
  }

  const oldStock = item.stockAllocated;
  item.stockAllocated = numStock;
  item.currentStock = numStock;

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'STOCK_ADJUSTMENT',
    `Admin adjusted base stock for ${item.name} in ${district}: ${oldStock} -> ${numStock}`
  );

  await saveDb();
  res.json({ message: `Stock updated for ${item.name}`, product: item });
});

// 11. Admin: Update Mila Inward Stock
router.post('/mila-inward', authenticateToken, requireAdmin, async (req, res) => {
  const { district, date, productId, milaQty } = req.body;
  if (!district || !date || !productId) {
    return res.status(400).json({ error: 'district, date, and productId are required' });
  }

  if (!db.milaStock) db.milaStock = {};
  const milaKey = `${district}:${date}:${productId}`;
  const numQty = Number(milaQty) || 0;

  if (numQty > 0) {
    db.milaStock[milaKey] = numQty;
  } else {
    delete db.milaStock[milaKey];
  }

  const items = db.districtProducts[district] || [];
  const item = items.find(p => p.productId === productId || p.id === productId);
  const prodName = item ? item.name : productId;

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'MILA_INWARD_UPDATE',
    `Updated Mila Inward stock for ${prodName} on ${date}: +${numQty}`
  );

  await saveDb();
  const updatedStock = computeDistrictDayStock(db, district, date);
  res.json({ message: `Updated inward stock for ${prodName}`, dayStock: updatedStock });
});

// 12. Admin: Update Inward Notes
router.post('/inward-notes', authenticateToken, requireAdmin, async (req, res) => {
  const { district, date, note } = req.body;
  if (!district || !date) {
    return res.status(400).json({ error: 'district and date are required' });
  }

  if (!db.inwardNotes) db.inwardNotes = {};
  const notesKey = `${district}:${date}`;
  db.inwardNotes[notesKey] = note || '';

  await saveDb();
  res.json({ message: 'Inward notes saved', note: db.inwardNotes[notesKey] });
});

// ================= STOCK DISPATCH & DEALER INWARD ACCEPTANCE SYSTEM =================

// 13. Admin: Dispatch Multi-Product Stock Consignment to Any District (Status: PENDING_ACCEPTANCE)
router.post('/dispatch-stock', authenticateToken, requireAdmin, async (req, res) => {
  const { district, productId, qty, items, challanNo, note } = req.body;

  if (!district) {
    return res.status(400).json({ error: 'Destination District is required' });
  }

  // Parse items array or single product
  let parsedItems = [];
  if (items && Array.isArray(items) && items.length > 0) {
    for (const it of items) {
      const q = Number(it.qty);
      if (it.productId && !isNaN(q) && q > 0) {
        const master = (db.products || []).find(p => p.id === it.productId || p.name.toUpperCase() === String(it.productId).toUpperCase());
        const distItem = (db.districtProducts[district] || []).find(p => p.productId === it.productId || p.id === it.productId || p.name.toUpperCase() === String(it.productId).toUpperCase());
        const prodName = (master && master.name) || (distItem && distItem.name) || it.name || it.productId;
        const prodId = (distItem && (distItem.productId || distItem.id)) || (master && master.id) || it.productId;
        parsedItems.push({
          productId: prodId,
          productName: prodName,
          qty: q
        });
      }
    }
  } else if (productId && !isNaN(Number(qty)) && Number(qty) > 0) {
    const q = Number(qty);
    const master = (db.products || []).find(p => p.id === productId || p.name.toUpperCase() === String(productId).toUpperCase());
    const distItem = (db.districtProducts[district] || []).find(p => p.productId === productId || p.id === productId || p.name.toUpperCase() === String(productId).toUpperCase());
    const prodName = (master && master.name) || (distItem && distItem.name) || productId;
    const prodId = (distItem && (distItem.productId || distItem.id)) || (master && master.id) || productId;
    parsedItems.push({
      productId: prodId,
      productName: prodName,
      qty: q
    });
  }

  if (parsedItems.length === 0) {
    return res.status(400).json({ error: 'At least one valid product and positive quantity is required' });
  }

  const totalUnits = parsedItems.reduce((sum, it) => sum + it.qty, 0);
  const summaryTitle = parsedItems.map(i => `${i.productName} (${i.qty})`).join(', ');

  const now = new Date();
  const transferId = 'trf_' + Date.now() + Math.random().toString(36).slice(2, 6);
  const transferNo = 'TRF-' + Math.floor(100000 + Math.random() * 900000);

  const transfer = {
    id: transferId,
    transferNo,
    district,
    productId: parsedItems[0].productId,
    productName: summaryTitle,
    qty: totalUnits,
    totalUnits,
    items: parsedItems,
    status: 'PENDING_ACCEPTANCE', // Waiting for dealer receipt
    challanNo: (challanNo || '').trim(),
    note: (note || '').trim(),
    dispatchedBy: req.user.username,
    dispatchedAt: now.toISOString(),
    receivedBy: null,
    receivedAt: null,
    receivedDate: null
  };

  if (!db.stockTransfers) db.stockTransfers = [];
  db.stockTransfers.unshift(transfer);

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'STOCK_DISPATCHED',
    `Dispatched ${totalUnits} units (${parsedItems.length} products: ${summaryTitle}) to ${district} [${transferNo}] (Status: In-Transit)`
  );

  await saveDb();

  // Save to Neon PostgreSQL stock_transfers table
  try {
    await pool.query(
      `INSERT INTO stock_transfers (id, transfer_no, district, product_id, product_name, qty, items, total_units, status, challan_no, note, dispatched_by, dispatched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING`,
      [transfer.id, transfer.transferNo, transfer.district, transfer.productId, transfer.productName, transfer.qty, JSON.stringify(transfer.items), transfer.totalUnits, transfer.status, transfer.challanNo, transfer.note, transfer.dispatchedBy, transfer.dispatchedAt]
    );
  } catch (err) {
    console.error('Postgres transfer insert error:', err.message);
  }

  res.status(201).json({
    message: `Stock consignment ${transferNo} (${parsedItems.length} products • ${totalUnits} units) dispatched to ${district}. Waiting for dealer to receive.`,
    transfer
  });
});

// 14. Get Transfers for a Specific District (Dealer & Admin)
router.get('/transfers/:district', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district } = req.params;
  const list = (db.stockTransfers || []).filter(t => t.district === district);
  const pending = list.filter(t => t.status === 'PENDING_ACCEPTANCE');
  const history = list.filter(t => t.status === 'ACCEPTED');
  const declined = list.filter(t => t.status === 'DECLINED');

  res.json({
    district,
    allTransfers: list,
    pendingTransfers: pending,
    historyTransfers: history,
    declinedTransfers: declined,
    pendingCount: pending.length
  });
});

// 15. Admin: Get All Transfers Across All 12 Districts
router.get('/admin/all-transfers', authenticateToken, requireAdmin, (req, res) => {
  const all = db.stockTransfers || [];
  const pending = all.filter(t => t.status === 'PENDING_ACCEPTANCE');
  const accepted = all.filter(t => t.status === 'ACCEPTED');
  const declined = all.filter(t => t.status === 'DECLINED');

  res.json({
    allTransfers: all,
    pendingTransfers: pending,
    acceptedTransfers: accepted,
    declinedTransfers: declined,
    pendingCount: pending.length,
    totalCount: all.length
  });
});

// 16. Dealer: Receive & Accept Multi-Product Stock Transfer (Adds stock to district + records Mila Inward)
router.post('/accept-stock/:transferId', authenticateToken, async (req, res) => {
  const { transferId } = req.params;
  const { date } = req.body;
  const receiveDate = date || new Date().toISOString().slice(0, 10);

  if (!db.stockTransfers) db.stockTransfers = [];
  const transfer = db.stockTransfers.find(t => t.id === transferId || t.transferNo === transferId);

  if (!transfer) {
    return res.status(404).json({ error: 'Stock transfer request not found' });
  }

  if (transfer.status === 'ACCEPTED') {
    return res.status(400).json({ error: 'This stock transfer has already been accepted and added.' });
  }

  if (transfer.status === 'DECLINED') {
    return res.status(400).json({ error: 'This stock transfer was declined and cannot be accepted.' });
  }

  // Enforce district permission for dealers
  if (req.user.role === 'dealer' && req.user.district !== transfer.district) {
    return res.status(403).json({ error: `Permission Denied: You cannot accept stock for ${transfer.district}` });
  }

  const now = new Date();
  const district = transfer.district;

  // Resolve item list (supports both new multi-product format and legacy single product)
  const itemsToAccept = (transfer.items && Array.isArray(transfer.items) && transfer.items.length > 0)
    ? transfer.items
    : [ { productId: transfer.productId, productName: transfer.productName, qty: Number(transfer.qty) || 0 } ];

  if (!db.districtProducts) db.districtProducts = {};
  if (!db.districtProducts[district]) db.districtProducts[district] = [];
  if (!db.milaStock) db.milaStock = {};

  const acceptedSummary = [];

  itemsToAccept.forEach(item => {
    const q = Number(item.qty) || 0;
    if (q <= 0) return;

    let distProd = db.districtProducts[district].find(p => p.productId === item.productId || p.id === item.productId || p.name.toUpperCase() === item.productName.toUpperCase());

    if (!distProd) {
      // Auto-allocate from master
      const master = (db.products || []).find(p => p.id === item.productId || p.name.toUpperCase() === item.productName.toUpperCase());
      distProd = {
        id: 'dp_' + district.toLowerCase().slice(0, 3) + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        productId: master ? master.id : item.productId,
        name: master ? master.name : item.productName,
        schemePrice: (master && master.schemes && master.schemes[0]) ? master.schemes[0].price : 2500,
        stockAllocated: q,
        currentStock: q,
        schemes: master ? master.schemes : []
      };
      db.districtProducts[district].push(distProd);
    } else {
      distProd.currentStock = (distProd.currentStock || 0) + q;
    }

    // Add to Mila Inward register
    const targetProdId = distProd ? (distProd.productId || distProd.id) : item.productId;
    const milaKey = `${district}:${receiveDate}:${targetProdId}`;
    db.milaStock[milaKey] = (Number(db.milaStock[milaKey]) || 0) + q;

    acceptedSummary.push(`${distProd.name} (+${q})`);
  });

  // Mark transfer as ACCEPTED
  transfer.status = 'ACCEPTED';
  transfer.receivedBy = req.user.username;
  transfer.receivedAt = now.toISOString();
  transfer.receivedDate = receiveDate;

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'STOCK_ACCEPTED',
    `Dealer ${req.user.username} received and accepted shipment [${transfer.transferNo}] (${acceptedSummary.join(', ')}) into ${district}`
  );

  await saveDb();

  // Update Neon PostgreSQL
  try {
    await pool.query(
      `UPDATE stock_transfers
       SET status = 'ACCEPTED', received_by = $1, received_at = $2, received_date = $3
       WHERE id = $4 OR transfer_no = $4`,
      [transfer.receivedBy, transfer.receivedAt, transfer.receivedDate, transfer.id]
    );
  } catch (err) {
    console.error('Postgres transfer update error:', err.message);
  }

  res.json({
    message: `Successfully received consignment [${transfer.transferNo}]! (${acceptedSummary.join(', ')}) added to ${district} stock.`,
    transfer,
    acceptedItems: acceptedSummary
  });
});

// 17. Dealer: Decline / Reject Stock Transfer (Does not add stock, marks DECLINED with reason)
router.post('/decline-stock/:transferId', authenticateToken, async (req, res) => {
  const { transferId } = req.params;
  const { reason } = req.body;

  if (!db.stockTransfers) db.stockTransfers = [];
  const transfer = db.stockTransfers.find(t => t.id === transferId || t.transferNo === transferId);

  if (!transfer) {
    return res.status(404).json({ error: 'Stock transfer request not found' });
  }

  if (transfer.status === 'ACCEPTED') {
    return res.status(400).json({ error: 'This stock transfer has already been accepted and added.' });
  }

  if (transfer.status === 'DECLINED') {
    return res.status(400).json({ error: 'This stock transfer has already been declined.' });
  }

  // Enforce district permission for dealers
  if (req.user.role === 'dealer' && req.user.district !== transfer.district) {
    return res.status(403).json({ error: `Permission Denied: You cannot decline stock for ${transfer.district}` });
  }

  const now = new Date();
  transfer.status = 'DECLINED';
  transfer.declinedBy = req.user.username;
  transfer.declinedAt = now.toISOString();
  transfer.declineReason = (reason || 'Declined by dealer').trim();

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    transfer.district,
    'STOCK_DECLINED',
    `Dealer ${req.user.username} declined stock consignment [${transfer.transferNo}] for ${transfer.district}. Reason: "${transfer.declineReason}"`
  );

  await saveDb();

  // Update Neon PostgreSQL
  try {
    await pool.query(
      `UPDATE stock_transfers
       SET status = 'DECLINED', declined_by = $1, declined_at = $2, decline_reason = $3
       WHERE id = $4 OR transfer_no = $4`,
      [transfer.declinedBy, transfer.declinedAt, transfer.declineReason, transfer.id]
    );
  } catch (err) {
    console.error('Postgres transfer decline error:', err.message);
  }

  res.json({
    message: `Stock consignment [${transfer.transferNo}] has been declined.`,
    transfer
  });
});

module.exports = router;
