// routes/inventoryRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb, logActivity } = require('../config/db');
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
router.post('/master-product', authenticateToken, requireAdmin, (req, res) => {
  const { name, schemes, defaultPrice } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Product name is required' });
  }

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

  const newMaster = {
    id: prodId,
    name: cleanName,
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
    `Created Master Product "${cleanName}" with ${initialSchemes.length} schemes`
  );

  saveDb();
  res.status(201).json({ message: `Master Product "${cleanName}" created successfully`, product: newMaster });
});

// 5. Admin: Rename Master Product (updates everywhere across all districts)
router.put('/master-product/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'New product name is required' });
  }

  const cleanName = name.trim().toUpperCase();
  const master = (db.products || []).find(p => p.id === id);
  if (!master) {
    return res.status(404).json({ error: 'Master product not found' });
  }

  const oldName = master.name;
  master.name = cleanName;

  // Propagate rename to all district assignments
  Object.keys(db.districtProducts || {}).forEach(dist => {
    db.districtProducts[dist].forEach(p => {
      if (p.productId === id || p.name.toUpperCase() === oldName.toUpperCase()) {
        p.name = cleanName;
      }
    });
  });

  logActivity(
    req.user.id,
    req.user.username,
    req.user.role,
    null,
    'MASTER_PRODUCT_RENAMED',
    `Renamed master product "${oldName}" -> "${cleanName}"`
  );

  saveDb();
  res.json({ message: `Product renamed to "${cleanName}" globally`, product: master });
});

// 6. Admin: Manage Schemes for Master Product (Add / Edit / Delete) -> propagates to every dealer automatically
router.post('/master-product/:id/scheme', authenticateToken, requireAdmin, (req, res) => {
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

  saveDb();
  res.json({ message: 'Master product schemes updated', product: master });
});

// 7. Admin: Delete Master Product
router.delete('/master-product/:id', authenticateToken, requireAdmin, (req, res) => {
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

  saveDb();
  res.json({ message: `Master product "${removed.name}" deleted from catalog` });
});

// ================= DISTRICT ALLOCATION (STRICTLY FROM MASTER LIST) =================

// 8. Admin: Assign Master Product to a District
router.post('/assign-district-product', authenticateToken, requireAdmin, (req, res) => {
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

  saveDb();
  res.status(201).json({ message: `Assigned "${master.name}" to ${district}`, product: newDistrictProduct });
});

// 9. Admin: Delete Product assignment from a district
router.delete('/district/:district/product/:productId', authenticateToken, requireAdmin, (req, res) => {
  const { district, productId } = req.params;
  if (!db.districtProducts[district]) {
    return res.status(404).json({ error: 'District not found' });
  }

  const idx = db.districtProducts[district].findIndex(p => p.productId === productId || p.id === productId);
  if (idx === -1) {
    return res.status(404).json({ error: 'Product not found in this district' });
  }

  const removed = db.districtProducts[district].splice(idx, 1)[0];
  logActivity(req.user.id, req.user.username, req.user.role, district, 'PRODUCT_DELETED', `Removed product "${removed.name}" from ${district}`);

  saveDb();
  res.json({ message: `Product '${removed.name}' removed from ${district}` });
});

// 10. Admin: Edit Base Stock for a Product in a District
router.post('/adjust-base-stock', authenticateToken, requireAdmin, (req, res) => {
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

  saveDb();
  res.json({ message: `Stock updated for ${item.name}`, product: item });
});

// 11. Admin: Update Mila Inward Stock
router.post('/mila-inward', authenticateToken, requireAdmin, (req, res) => {
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

  saveDb();
  const updatedStock = computeDistrictDayStock(db, district, date);
  res.json({ message: `Updated inward stock for ${prodName}`, dayStock: updatedStock });
});

// 12. Admin: Update Inward Notes
router.post('/inward-notes', authenticateToken, requireAdmin, (req, res) => {
  const { district, date, note } = req.body;
  if (!district || !date) {
    return res.status(400).json({ error: 'district and date are required' });
  }

  if (!db.inwardNotes) db.inwardNotes = {};
  const notesKey = `${district}:${date}`;
  db.inwardNotes[notesKey] = note || '';

  saveDb();
  res.json({ message: 'Inward notes saved', note: db.inwardNotes[notesKey] });
});

module.exports = router;
