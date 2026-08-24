// routes/inventoryRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb, logActivity, normalizeDistrictName, EXCEL_PRODUCTS } = require('../config/db');
const { pool } = require('../config/postgres');
const { authenticateToken, requireAdmin, enforceDistrictAccess } = require('../middleware/auth');
const { computeDistrictDayStock } = require('../utils/cashRollover');
const { getDistricts } = require('../config/db');

// ---------------------------------------------------------------------------
// Shared stock-transfer helpers.
//
// A district's stock and the Central Main Warehouse's stock are two views of
// the SAME pool of physical stock - every unit sitting in a district was, at
// some point, moved out of the central warehouse. These two helpers are the
// only place that movement should ever happen, so every route (assign,
// bulk-assign, adjust, toggle-off, delete) stays consistent instead of each
// route inventing its own partial logic.
// ---------------------------------------------------------------------------

// Moves `targetStock - currentStock` units between the district and the
// Central Main Warehouse (raising district stock pulls from central,
// lowering it returns to central). Blocks if central doesn't have enough.
// Returns { ok:true, delta, centralStock } or { ok:false, error }.
function moveStockToDistrictLevel(db, masterProductId, currentDistrictStock, targetStock) {
  if (!db.mainWarehouseStock) db.mainWarehouseStock = {};
  const delta = targetStock - currentDistrictStock;
  const centralAvailable = Number(db.mainWarehouseStock[masterProductId]) || 0;

  if (delta > 0 && delta > centralAvailable) {
    return {
      ok: false,
      error: `Cannot raise stock by ${delta} - only ${centralAvailable} units of this product are available in the Central Main Warehouse. Inward more central stock first.`
    };
  }

  db.mainWarehouseStock[masterProductId] = Math.max(0, Math.round((centralAvailable - delta) * 100) / 100);
  return { ok: true, delta, centralStock: db.mainWarehouseStock[masterProductId] };
}

// Returns ALL of a district-product's current stock back to the Central Main
// Warehouse. Used whenever a product is unassigned/deleted from a district -
// its stock must never simply vanish from the system's books.
function returnStockToCentral(db, masterProductId, qty) {
  if (!db.mainWarehouseStock) db.mainWarehouseStock = {};
  const q = Number(qty) || 0;
  if (q <= 0) return db.mainWarehouseStock[masterProductId] || 0;
  const centralNow = Number(db.mainWarehouseStock[masterProductId]) || 0;
  db.mainWarehouseStock[masterProductId] = Math.round((centralNow + q) * 100) / 100;
  return db.mainWarehouseStock[masterProductId];
}

function getMasterList(db) {
  return (db.products && db.products.length > 0) ? db.products : EXCEL_PRODUCTS.map((p, idx) => ({
    id: `prod_${idx + 1}`,
    name: p.name,
    isSpecial: ['PLAY MORE', 'FOUJI', 'EYE SUTRA', 'ALERGY'].includes(p.name.toUpperCase()),
    defaultPrice: p.schemes[0].price,
    schemes: p.schemes,
    isActive: true
  }));
}


// 0. Get list of active districts
router.get('/districts-list', authenticateToken, (req, res) => {
  const activeDistricts = getDistricts();
  res.json({ districts: activeDistricts });
});

// 1. Get complete Daily Stock Register matching Excel table for a district and date
router.get('/district-day-stock/:district/:date', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district, date } = req.params;
  const dayStock = computeDistrictDayStock(db, district, date);
  res.json(dayStock);
});

// 2. Get raw district products and schemes
const { getDistrictProductsSafely } = require('../utils/cashRollover');
router.get('/district/:district', authenticateToken, enforceDistrictAccess, (req, res) => {
  const { district } = req.params;
  const items = getDistrictProductsSafely(db, district);
  // Populate latest master info
  const populated = items.map(p => {
    const master = (db.products || []).find(mp => mp.id === p.productId || mp.name.toUpperCase() === (p.name || '').toUpperCase());
    return {
      ...p,
      name: master ? master.name : p.name,
      isSpecial: Boolean(p.isSpecial || (master && master.isSpecial)),
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

  if (db.deletedMasterProducts) {
    db.deletedMasterProducts = db.deletedMasterProducts.filter(n => n.toUpperCase() !== cleanName);
  }

  // Auto-assign to requested districts (or all 0-stock districts if requested)
  const targetDistricts = req.body.assignToDistricts || (req.body.assignToAllZeroDistricts ? ['Chittorgarh', 'Alwar', 'Bikaner', 'Uttarakhand', 'Udham Singh Nagar'] : []);
  if (Array.isArray(targetDistricts) && targetDistricts.length > 0) {
    if (!db.districtProducts) db.districtProducts = {};
    if (!db.customStockLocks) db.customStockLocks = {};

    targetDistricts.forEach(dist => {
      if (!db.districtProducts[dist]) db.districtProducts[dist] = [];
      const alreadyHas = db.districtProducts[dist].some(p => p.productId === prodId || (p.name || '').toUpperCase() === cleanName);
      if (!alreadyHas) {
        const pfx = dist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3);
        const distStock = Number(req.body.initialStock) || 0;
        db.districtProducts[dist].push({
          id: `dp_${pfx}_${prodId}`,
          productId: prodId,
          name: cleanName,
          isSpecial: productIsSpecial,
          schemePrice: newMaster.defaultPrice,
          stockAllocated: distStock,
          currentStock: distStock,
          schemes: JSON.parse(JSON.stringify(initialSchemes)),
          isActive: true,
          isCustomStockLocked: true
        });
        db.customStockLocks[`${dist}:${prodId}`] = distStock;
      }
    });
  }

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    null,
    'MASTER_PRODUCT_CREATED',
    `Created Master Product "${cleanName}" (${productIsSpecial ? 'SPECIAL' : 'STANDARD'}) with ${initialSchemes.length} schemes`
  );

  await saveDb();
  res.status(201).json({ 
    message: `Master Product "${cleanName}" created successfully${targetDistricts.length > 0 ? ` and assigned to ${targetDistricts.join(', ')}` : ''}`, 
    product: newMaster 
  });
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
  const cleanId = (id || '').trim();
  const idx = (db.products || []).findIndex(p => 
    p.id === cleanId || 
    (p.name || '').toUpperCase() === cleanId.toUpperCase()
  );
  if (idx === -1) {
    return res.status(404).json({ error: 'Master product not found' });
  }

  const removed = db.products.splice(idx, 1)[0];
  const removedName = (removed.name || '').toUpperCase();

  if (!db.deletedMasterProducts) db.deletedMasterProducts = [];
  if (!db.deletedMasterProducts.includes(removedName)) {
    db.deletedMasterProducts.push(removedName);
  }

  // Remove from all district assignments
  Object.keys(db.districtProducts || {}).forEach(dist => {
    db.districtProducts[dist] = (db.districtProducts[dist] || []).filter(p => 
      p.productId !== removed.id && 
      p.id !== removed.id && 
      (p.name || '').toUpperCase() !== removedName
    );
    if (db.customStockLocks) {
      delete db.customStockLocks[`${dist}:${removed.id}`];
      delete db.customStockLocks[`${dist}:${cleanId}`];
    }
  });

  logActivity(req.user.id, req.user.username, req.user.role, null, 'MASTER_PRODUCT_DELETED', `Deleted master product "${removed.name}" globally`);

  await saveDb();
  res.json({ message: `Master product "${removed.name}" deleted from catalog and all districts` });
});

// ================= DISTRICT ALLOCATION (STRICTLY FROM MASTER LIST) =================

// 7.1 Admin: Get Full Master Products Matrix for a District (with tick assignment & stock)
router.get('/district-matrix/:district', authenticateToken, requireAdmin, (req, res) => {
  const { district } = req.params;
  const distProducts = getDistrictProductsSafely(db, district);
  const masterProducts = db.products && db.products.length > 0 ? db.products : EXCEL_PRODUCTS.map((p, idx) => ({
    id: `prod_${idx + 1}`,
    name: p.name,
    isSpecial: ['PLAY MORE', 'FOUJI', 'EYE SUTRA', 'ALERGY'].includes(p.name.toUpperCase()),
    defaultPrice: p.schemes[0].price,
    schemes: p.schemes,
    isActive: true
  }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const dayStock = computeDistrictDayStock(db, district, todayStr);
  const locks = db.customStockLocks || {};

  const matrix = masterProducts.map(mp => {
    const assigned = distProducts.find(dp => dp.productId === mp.id || (dp.name && dp.name.toUpperCase() === mp.name.toUpperCase()));
    const liveItem = dayStock.products ? dayStock.products.find(dp => dp.productId === mp.id || (dp.name && dp.name.toUpperCase() === mp.name.toUpperCase())) : null;
    const lockKey = `${district}:${mp.id}`;
    const isLocked = locks[lockKey] !== undefined;
    const stockAllocated = assigned ? Number(assigned.stockAllocated) || 0 : (isLocked ? Number(locks[lockKey]) : 0);
    const liveStock = liveItem ? liveItem.closingStock : (assigned ? Number(assigned.currentStock) || 0 : stockAllocated);

    return {
      masterId: mp.id,
      name: mp.name,
      isSpecial: Boolean(mp.isSpecial || (assigned && assigned.isSpecial)),
      schemes: mp.schemes || (assigned && assigned.schemes) || [],
      defaultPrice: mp.defaultPrice || (assigned && assigned.schemePrice) || 2500,
      isAssigned: Boolean(assigned),
      districtProductId: assigned ? assigned.id : null,
      stockAllocated,
      currentStock: liveStock,
      isCustomStockLocked: isLocked || Boolean(assigned && assigned.isCustomStockLocked)
    };
  });

  res.json({
    district,
    totalMaster: masterProducts.length,
    assignedCount: distProducts.length,
    matrix
  });
});

// 7.2 Admin: Toggle Single Product Assignment to a District (Tick / Untick)
router.post('/district-product-toggle', authenticateToken, requireAdmin, async (req, res) => {
  const { district, masterProductId, isAssigned, initialStock } = req.body;

  if (!district || !masterProductId) {
    return res.status(400).json({ error: 'District and masterProductId are required' });
  }

  const canonicalDist = normalizeDistrictName(district);

  if (!db.districtProducts) db.districtProducts = {};
  if (!db.districtProducts[canonicalDist]) db.districtProducts[canonicalDist] = [];

  const masterList = getMasterList(db);

  const master = masterList.find(p => p.id === masterProductId || p.name.toUpperCase() === masterProductId.toUpperCase());
  if (!master) {
    return res.status(404).json({ error: 'Master product not found' });
  }

  const existingIdx = db.districtProducts[canonicalDist].findIndex(p => p.productId === master.id || p.name.toUpperCase() === master.name.toUpperCase());

  if (isAssigned) {
    const stockNum = initialStock !== undefined && !isNaN(Number(initialStock)) ? Number(initialStock) : 0;
    const currentStock = existingIdx === -1 ? 0 : (Number(db.districtProducts[canonicalDist][existingIdx].currentStock) || 0);

    const move = moveStockToDistrictLevel(db, master.id, currentStock, stockNum);
    if (!move.ok) {
      return res.status(400).json({ error: move.error });
    }

    if (existingIdx === -1) {
      const pfx = canonicalDist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3);
      const newDistrictProduct = {
        id: `dp_${pfx}_${master.id}`,
        productId: master.id,
        name: master.name,
        isSpecial: Boolean(master.isSpecial),
        schemePrice: (master.schemes && master.schemes[0]) ? master.schemes[0].price : (master.defaultPrice || 2500),
        stockAllocated: stockNum,
        currentStock: stockNum,
        schemes: JSON.parse(JSON.stringify(master.schemes || [])),
        isActive: true,
        isCustomStockLocked: true
      };
      db.districtProducts[canonicalDist].push(newDistrictProduct);
    } else {
      db.districtProducts[canonicalDist][existingIdx].stockAllocated = stockNum;
      db.districtProducts[canonicalDist][existingIdx].currentStock = stockNum;
      db.districtProducts[canonicalDist][existingIdx].isCustomStockLocked = true;
    }

    logActivity(
      req.user.id,
      req.user.username,
      req.user.role,
      canonicalDist,
      'DISTRICT_PRODUCT_ASSIGNED',
      `Assigned "${master.name}" to ${canonicalDist} with stock ${stockNum} (Central Main Warehouse now ${move.centralStock})`
    );
  } else {
    // Untick / Remove - return whatever stock this district was holding back
    // to the Central Main Warehouse. It must never just disappear.
    if (existingIdx !== -1) {
      const removed = db.districtProducts[canonicalDist][existingIdx];
      const returnedQty = Number(removed.currentStock) || 0;
      const centralNow = returnStockToCentral(db, master.id, returnedQty);
      db.districtProducts[canonicalDist].splice(existingIdx, 1);
      logActivity(
        req.user.id,
        req.user.username,
        req.user.role,
        canonicalDist,
        'DISTRICT_PRODUCT_UNASSIGNED',
        `Unticked/Removed "${master.name}" from ${canonicalDist} - returned ${returnedQty} units to Central Main Warehouse (now ${centralNow})`
      );
    }
  }

  await saveDb();
  res.json({
    message: isAssigned ? `Assigned "${master.name}" to ${canonicalDist}` : `Removed "${master.name}" from ${canonicalDist}`,
    assignedCount: db.districtProducts[canonicalDist].length,
    districtProducts: db.districtProducts[canonicalDist]
  });
});

// 7.3 Admin: Bulk Assign / Update Products for a District (Save All Ticks & Stocks)
router.post('/bulk-assign-district-products', authenticateToken, requireAdmin, async (req, res) => {
  const { district, assignments } = req.body;
  // assignments: Array<{ productId: string, isAssigned: boolean, stockAllocated: number }>

  if (!district || !Array.isArray(assignments)) {
    return res.status(400).json({ error: 'District and assignments array required' });
  }

  const canonicalDist = normalizeDistrictName(district);

  if (!db.districtProducts) db.districtProducts = {};

  const masterList = getMasterList(db);

  const currentList = getDistrictProductsSafely(db, canonicalDist);
  const updatedList = [];
  const pfx = canonicalDist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3);
  const centralMoves = [];
  const blockedItems = [];

  assignments.forEach(item => {
    if (!item.isAssigned) return;

    const master = masterList.find(p => p.id === item.productId || p.name.toUpperCase() === (item.productId || '').toUpperCase());
    if (!master) return;

    const existing = currentList.find(p => p.productId === master.id || p.name.toUpperCase() === master.name.toUpperCase());
    const stockNum = item.stockAllocated !== undefined && !isNaN(Number(item.stockAllocated))
      ? Number(item.stockAllocated)
      : (existing ? Number(existing.stockAllocated) || 0 : 0);
    const previousStock = existing ? (Number(existing.currentStock) || 0) : 0;

    const move = moveStockToDistrictLevel(db, master.id, previousStock, stockNum);
    if (!move.ok) {
      // Keep the product at its previous stock rather than silently failing
      // the whole bulk save - report it back to the admin instead.
      blockedItems.push({ product: master.name, error: move.error });
      updatedList.push(existing || {
        id: `dp_${pfx}_${master.id}`,
        productId: master.id, name: master.name, isSpecial: Boolean(master.isSpecial),
        schemePrice: (master.schemes && master.schemes[0]) ? master.schemes[0].price : (master.defaultPrice || 2500),
        stockAllocated: 0, currentStock: 0,
        schemes: JSON.parse(JSON.stringify(master.schemes || [])), isActive: true, isCustomStockLocked: false
      });
      return;
    }

    centralMoves.push(`${master.name}: ${previousStock}->${stockNum}`);

    const distProd = {
      id: existing ? existing.id : `dp_${pfx}_${master.id}`,
      productId: master.id,
      name: master.name,
      isSpecial: Boolean(master.isSpecial),
      schemePrice: (master.schemes && master.schemes[0]) ? master.schemes[0].price : (master.defaultPrice || 2500),
      stockAllocated: stockNum,
      currentStock: stockNum,
      schemes: JSON.parse(JSON.stringify(master.schemes || [])),
      isActive: true,
      isCustomStockLocked: true
    };

    updatedList.push(distProd);
  });

  // Anything that WAS assigned before but isn't in the new updatedList must
  // have its stock returned to the Central Main Warehouse, not discarded.
  const updatedIds = new Set(updatedList.map(p => p.productId));
  currentList.forEach(prev => {
    if (!updatedIds.has(prev.productId) && Number(prev.currentStock) > 0) {
      const centralNow = returnStockToCentral(db, prev.productId, Number(prev.currentStock));
      centralMoves.push(`${prev.name}: returned ${prev.currentStock} to central (now ${centralNow})`);
    }
  });

  db.districtProducts[canonicalDist] = updatedList;

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    canonicalDist,
    'BULK_DISTRICT_PRODUCTS_UPDATED',
    `Updated assigned products for ${canonicalDist}: ${updatedList.length} products active. ${centralMoves.join('; ')}`
  );

  await saveDb();
  res.json({
    message: `Updated products and stock for ${canonicalDist} (${updatedList.length} products assigned)${blockedItems.length ? ` - ${blockedItems.length} change(s) skipped, see warnings` : ''}`,
    assignedCount: updatedList.length,
    districtProducts: updatedList,
    warnings: blockedItems
  });
});

// 8. Admin: Assign Master Product to a District (Single Add)
router.post('/assign-district-product', authenticateToken, requireAdmin, async (req, res) => {
  const { district, masterProductId, initialStock } = req.body;

  if (!district || !masterProductId) {
    return res.status(400).json({ error: 'District and masterProductId are required' });
  }

  const canonicalDist = normalizeDistrictName(district);
  const master = (db.products || []).find(p => p.id === masterProductId);
  if (!master) {
    return res.status(400).json({ error: 'Invalid product! Products can only be assigned from the Master Product Catalog.' });
  }

  if (!db.districtProducts[canonicalDist]) {
    db.districtProducts[canonicalDist] = [];
  }

  const existing = db.districtProducts[canonicalDist].find(p => p.productId === master.id || p.name.toUpperCase() === master.name.toUpperCase());
  if (existing) {
    return res.status(400).json({ error: `Product "${master.name}" is already assigned to ${canonicalDist}` });
  }

  const stockNum = Number(initialStock) || 0;
  const move = moveStockToDistrictLevel(db, master.id, 0, stockNum);
  if (!move.ok) {
    return res.status(400).json({ error: move.error });
  }

  const newDistrictProduct = {
    id: `dp_${canonicalDist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3)}_${master.id}`,
    productId: master.id,
    name: master.name,
    isSpecial: master.isSpecial !== undefined ? Boolean(master.isSpecial) : false,
    schemePrice: (master.schemes && master.schemes[0]) ? master.schemes[0].price : master.defaultPrice,
    stockAllocated: stockNum,
    currentStock: stockNum,
    schemes: master.schemes || [],
    isActive: true,
    isCustomStockLocked: true
  };

  db.districtProducts[canonicalDist].push(newDistrictProduct);

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    canonicalDist,
    'PRODUCT_ASSIGNED',
    `Assigned master product "${master.name}" to ${canonicalDist} with initial stock ${stockNum} (Central Main Warehouse now ${move.centralStock})`
  );

  await saveDb();
  res.status(201).json({ message: `Assigned "${master.name}" to ${canonicalDist}`, product: newDistrictProduct, centralStockRemaining: move.centralStock });
});

// 9. Admin: Delete Product assignment from a district (Permanent Removal)
router.delete('/district/:district/product/:productId', authenticateToken, requireAdmin, async (req, res) => {
  const { productId } = req.params;
  const district = normalizeDistrictName(req.params.district);

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
  const returnedQty = removedProds.reduce((sum, p) => sum + (Number(p.currentStock) || 0), 0);
  const masterProductId = removedProds[0].productId;

  // Filter out the product completely
  db.districtProducts[district] = db.districtProducts[district].filter(p =>
    p.productId !== cleanProdId &&
    p.id !== cleanProdId &&
    p.name.toUpperCase() !== cleanProdId.toUpperCase()
  );

  // Its stock must go back to the Central Main Warehouse, not disappear.
  const centralNow = returnStockToCentral(db, masterProductId, returnedQty);

  if (db.customStockLocks) {
    delete db.customStockLocks[`${district}:${cleanProdId}`];
  }

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    district,
    'PRODUCT_DELETED',
    `Permanently removed product "${removedName}" from ${district} - returned ${returnedQty} units to Central Main Warehouse (now ${centralNow})`
  );

  await saveDb();

  res.json({
    message: `Product '${removedName}' permanently removed from ${district} (${returnedQty} units returned to Central Main Warehouse)`,
    remainingProducts: db.districtProducts[district],
    centralStockRemaining: centralNow
  });
});

// 10. Admin: Edit Base Stock for a Product in a District (Locks Stock Permanently)
router.post('/adjust-base-stock', authenticateToken, requireAdmin, async (req, res) => {
  const { district, productId, newStock } = req.body;
  const numStock = Number(newStock);
  if (!district || !productId || isNaN(numStock) || numStock < 0) {
    return res.status(400).json({ error: 'Valid positive stock number required' });
  }

  const canonicalDist = normalizeDistrictName(district);

  if (!db.districtProducts) db.districtProducts = {};

  const masterList = getMasterList(db);
  const master = masterList.find(p => p.id === productId || (p.name && p.name.toUpperCase() === String(productId).toUpperCase()));

  // Find or create district products list safely
  let items = getDistrictProductsSafely(db, canonicalDist);
  let item = items.find(p => p.productId === productId || p.id === productId || (p.name && p.name.toUpperCase() === String(productId).toUpperCase()));

  const previousStock = item ? (Number(item.currentStock) || 0) : 0;
  const mId = item ? item.productId : (master ? master.id : productId);

  const move = moveStockToDistrictLevel(db, mId, previousStock, numStock);
  if (!move.ok) {
    return res.status(400).json({ error: move.error });
  }

  if (!item && master) {
    // If not yet assigned, automatically assign it with the new stock
    const pfx = canonicalDist.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 3);
    item = {
      id: `dp_${pfx}_${master.id}`,
      productId: master.id,
      name: master.name,
      isSpecial: Boolean(master.isSpecial),
      schemePrice: (master.schemes && master.schemes[0]) ? master.schemes[0].price : (master.defaultPrice || 2500),
      stockAllocated: numStock,
      currentStock: numStock,
      schemes: JSON.parse(JSON.stringify(master.schemes || [])),
      isActive: true,
      isCustomStockLocked: true
    };
    if (!db.districtProducts[canonicalDist]) db.districtProducts[canonicalDist] = [];
    db.districtProducts[canonicalDist].push(item);
  } else if (item) {
    item.stockAllocated = numStock;
    item.currentStock = numStock;
    item.isCustomStockLocked = true;
  } else {
    return res.status(404).json({ error: 'Product not found' });
  }

  const pId = item.productId;

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    canonicalDist,
    'STOCK_ADJUSTMENT',
    `Admin adjusted stock for ${item.name} in ${canonicalDist}: ${previousStock} -> ${numStock} units (Central Main Warehouse now ${move.centralStock})`
  );

  await saveDb();

  // Persist to Neon PostgreSQL district_products
  try {
    await pool.query(
      `INSERT INTO district_products (id, district, product_id, product_name, stock_allocated, current_stock, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (district, product_id) DO UPDATE
       SET stock_allocated = $5, current_stock = $6`,
      [item.id, canonicalDist, pId, item.name, numStock, numStock]
    );
  } catch (pgErr) {
    console.error('Postgres district_products update error:', pgErr.message);
  }

  res.json({
    message: `Stock for "${item.name}" updated to ${numStock} in ${canonicalDist} (Central Main Warehouse now ${move.centralStock})`,
    product: item,
    centralStockRemaining: move.centralStock
  });
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

  // Enforce Central Main Stock constraint: Transfer cannot exceed available Central Stock
  if (!db.mainWarehouseStock) db.mainWarehouseStock = {};
  for (const it of parsedItems) {
    const master = (db.products || []).find(p => p.id === it.productId || (p.name && p.name.toUpperCase() === it.productName.toUpperCase()));
    const mId = master ? master.id : it.productId;
    const available = Number(db.mainWarehouseStock[mId]) || 0;
    if (available < it.qty) {
      return res.status(400).json({
        error: `Cannot dispatch ${it.qty} units of "${it.productName}". Only ${available} units available in Central Main Warehouse. Please inward stock first before transferring to branch.`
      });
    }
  }

  // Deduct from Central Main Warehouse
  for (const it of parsedItems) {
    const master = (db.products || []).find(p => p.id === it.productId || (p.name && p.name.toUpperCase() === it.productName.toUpperCase()));
    const mId = master ? master.id : it.productId;
    db.mainWarehouseStock[mId] = Math.max(0, Math.round(((Number(db.mainWarehouseStock[mId]) || 0) - it.qty) * 10) / 10);
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
    `Dispatched ${totalUnits} units (${parsedItems.length} products: ${summaryTitle}) to ${district} [${transferNo}] (Status: In-Transit, Deducted from Central Stock)`
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

  // Restore declined items back to Central Main Warehouse
  if (!db.mainWarehouseStock) db.mainWarehouseStock = {};
  const itemsToRestore = (transfer.items && Array.isArray(transfer.items) && transfer.items.length > 0) ? transfer.items : [{ productId: transfer.productId, qty: transfer.qty }];
  itemsToRestore.forEach(it => {
    const master = (db.products || []).find(p => p.id === it.productId || p.name.toUpperCase() === (it.productName || '').toUpperCase());
    const mId = master ? master.id : it.productId;
    if (mId) {
      db.mainWarehouseStock[mId] = (Number(db.mainWarehouseStock[mId]) || 0) + (Number(it.qty) || 0);
    }
  });

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    transfer.district,
    'STOCK_DECLINED',
    `Dealer ${req.user.username} declined stock consignment [${transfer.transferNo}] for ${transfer.district}. Reason: "${transfer.declineReason}" (Units returned to Central Stock)`
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
    message: `Stock consignment [${transfer.transferNo}] has been declined and returned to Central Main Warehouse.`,
    transfer
  });
});

// 18. Admin: Central Main Warehouse Stock Summary (Live Distribution Across Central + Branches + Deliveries)
router.get('/main-stock-summary', authenticateToken, requireAdmin, (req, res) => {
  const masterProducts = db.products && db.products.length > 0 ? db.products : EXCEL_PRODUCTS.map((p, idx) => ({
    id: `prod_${idx + 1}`,
    name: p.name,
    isSpecial: ['PLAY MORE', 'FOUJI', 'EYE SUTRA', 'ALERGY'].includes(p.name.toUpperCase()),
    defaultPrice: p.schemes[0].price,
    schemes: p.schemes,
    isActive: true
  }));

  const activeDistricts = getDistricts();
  const todayStr = new Date().toISOString().slice(0, 10);
  if (!db.mainWarehouseStock) db.mainWarehouseStock = {};
  if (!db.stockTransfers) db.stockTransfers = [];
  if (!db.customerOrders) db.customerOrders = [];

  // Compute live district stock for all districts
  const districtDayStocks = {};
  activeDistricts.forEach(dist => {
    districtDayStocks[dist] = computeDistrictDayStock(db, dist, todayStr);
  });

  const productsSummary = masterProducts.map(mp => {
    const mainStock = Number(db.mainWarehouseStock[mp.id]) || 0;

    // In-Transit transfers waiting for dealer acceptance
    const pendingTransfers = (db.stockTransfers || []).filter(t => t.status === 'PENDING_ACCEPTANCE');
    let inTransitQty = 0;
    pendingTransfers.forEach(t => {
      if (t.items && Array.isArray(t.items)) {
        t.items.forEach(it => {
          if (it.productId === mp.id || (it.productName && it.productName.toUpperCase() === mp.name.toUpperCase())) {
            inTransitQty += (Number(it.qty) || 0);
          }
        });
      } else if (t.productId === mp.id || (t.productName && t.productName.toUpperCase() === mp.name.toUpperCase())) {
        inTransitQty += (Number(t.qty) || 0);
      }
    });

    // Branch Holding Stock breakdown
    const branchBreakdown = {};
    let totalBranchStock = 0;
    activeDistricts.forEach(dist => {
      const dStock = districtDayStocks[dist];
      const prodItem = dStock && dStock.products ? dStock.products.find(p => p.productId === mp.id || (p.name && p.name.toUpperCase() === mp.name.toUpperCase())) : null;
      const closing = prodItem ? Number(prodItem.closingStock) || 0 : 0;
      branchBreakdown[dist] = closing;
      totalBranchStock += closing;
    });

    // Delivered / Sold to customers
    const soldOrders = (db.customerOrders || []).filter(o => o.productId === mp.id || (o.productName && o.productName.toUpperCase() === mp.name.toUpperCase()));
    const totalDeliveredQty = soldOrders.reduce((sum, o) => sum + (Number(o.qty) || 0), 0);

    const totalSystemStock = Math.round((mainStock + inTransitQty + totalBranchStock) * 10) / 10;
    const totalPurchasedOrInwarded = Math.round((totalSystemStock + totalDeliveredQty) * 10) / 10;

    return {
      productId: mp.id,
      name: mp.name,
      isSpecial: Boolean(mp.isSpecial),
      defaultPrice: mp.defaultPrice || (mp.schemes && mp.schemes[0] ? mp.schemes[0].price : 2500),
      mainWarehouseStock: mainStock,
      inTransitStock: inTransitQty,
      branchStockTotal: Math.round(totalBranchStock * 10) / 10,
      branchBreakdown,
      totalDeliveredSales: totalDeliveredQty,
      totalSystemStock,
      totalPurchasedOrInwarded
    };
  });

  const totals = {
    totalMainStock: productsSummary.reduce((sum, p) => sum + p.mainWarehouseStock, 0),
    totalInTransit: productsSummary.reduce((sum, p) => sum + p.inTransitStock, 0),
    totalBranchStock: Math.round(productsSummary.reduce((sum, p) => sum + p.branchStockTotal, 0) * 10) / 10,
    totalDeliveredSales: productsSummary.reduce((sum, p) => sum + p.totalDeliveredSales, 0),
    totalSystemStock: Math.round(productsSummary.reduce((sum, p) => sum + p.totalSystemStock, 0) * 10) / 10
  };

  res.json({
    products: productsSummary,
    totals,
    activeDistricts
  });
});

// 19. Admin: Add / Inward Stock to Central Main Warehouse
router.post('/inward-main-stock', authenticateToken, requireAdmin, async (req, res) => {
  const { productId, qty, supplier, invoiceNo, note, date } = req.body;
  const numQty = Number(qty);

  if (!productId || isNaN(numQty) || numQty <= 0) {
    return res.status(400).json({ error: 'Valid Product and positive quantity are required' });
  }

  const masterList = (db.products && db.products.length > 0) ? db.products : EXCEL_PRODUCTS.map((p, idx) => ({
    id: `prod_${idx + 1}`,
    name: p.name,
    isSpecial: ['PLAY MORE', 'FOUJI', 'EYE SUTRA', 'ALERGY'].includes(p.name.toUpperCase()),
    defaultPrice: p.schemes[0].price,
    schemes: p.schemes,
    isActive: true
  }));

  const master = masterList.find(p => p.id === productId || (p.name && p.name.toUpperCase() === String(productId).toUpperCase()));
  if (!master) {
    return res.status(404).json({ error: 'Master product not found' });
  }

  if (!db.mainWarehouseStock) db.mainWarehouseStock = {};
  if (!db.mainStockInwardLogs) db.mainStockInwardLogs = [];

  const prevStock = Number(db.mainWarehouseStock[master.id]) || 0;
  const newStock = Math.round((prevStock + numQty) * 10) / 10;
  db.mainWarehouseStock[master.id] = newStock;

  const now = new Date();
  const logEntry = {
    id: 'inw_' + Date.now() + Math.random().toString(36).slice(2, 6),
    inwardDate: date || now.toISOString().slice(0, 10),
    productId: master.id,
    productName: master.name,
    qty: numQty,
    supplier: (supplier || 'Factory / Manufacturer').trim(),
    invoiceNo: (invoiceNo || '').trim(),
    note: (note || '').trim(),
    createdBy: req.user.username,
    createdAt: now.toISOString()
  };

  db.mainStockInwardLogs.unshift(logEntry);

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    'Central Main Warehouse',
    'MAIN_STOCK_INWARD',
    `Inwarded ${numQty} units of "${master.name}" into Central Main Warehouse from ${logEntry.supplier} (New Balance: ${newStock} units)`
  );

  await saveDb();

  // Persist to Neon PostgreSQL tables
  try {
    await pool.query(
      `INSERT INTO main_warehouse_stock (product_id, product_name, current_stock, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (product_id) DO UPDATE SET current_stock = $3, updated_at = $4`,
      [master.id, master.name, newStock, now.toISOString()]
    );
    await pool.query(
      `INSERT INTO main_stock_inward_logs (id, inward_date, product_id, product_name, qty, supplier, invoice_no, note, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO NOTHING`,
      [logEntry.id, logEntry.inwardDate, logEntry.productId, logEntry.productName, logEntry.qty, logEntry.supplier, logEntry.invoiceNo, logEntry.note, logEntry.createdBy, logEntry.createdAt]
    );
  } catch (err) {
    console.error('Postgres main stock inward error:', err.message);
  }

  res.status(201).json({
    message: `Successfully inwarded ${numQty} units of "${master.name}" into Central Main Warehouse! Current Stock: ${newStock} units.`,
    productName: master.name,
    addedQty: numQty,
    currentCentralStock: newStock,
    log: logEntry
  });
});

// 20. Admin: Get Central Stock Inward History Logs
router.get('/main-stock-inward-logs', authenticateToken, requireAdmin, (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const logs = (db.mainStockInwardLogs || []).slice(0, limit);
  res.json({ logs, totalCount: (db.mainStockInwardLogs || []).length });
});

module.exports = router;
