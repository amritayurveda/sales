// routes/productRoutes.js
const express = require('express');
const router = express.Router();
const { db, saveDb } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Get all active products (dealers and admins)
router.get('/', authenticateToken, (req, res) => {
  const products = (db.products || [])
    .filter(p => p.isActive !== false)
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  res.json({ products });
});

// Add new product (admin only)
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  const { name, defaultPrice, isSpecial, schemes } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Product name is required' });
  }

  const trimmedName = name.trim().toUpperCase();
  const existing = (db.products || []).find(p => p.name.toUpperCase() === trimmedName);
  if (existing) {
    return res.status(400).json({ error: 'A product with this name already exists' });
  }

  const prodId = 'prod_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const initialSchemes = (schemes && Array.isArray(schemes) && schemes.length > 0) ? schemes : [
    { id: `sch_${prodId}_1`, name: `${trimmedName} 1`, qty: 1, price: Number(defaultPrice) || 2500, dc: 250 }
  ];

  const newProduct = {
    id: prodId,
    name: trimmedName,
    defaultPrice: Number(defaultPrice) || initialSchemes[0].price || 2500,
    isSpecial: Boolean(isSpecial),
    schemes: initialSchemes,
    isActive: true,
    sortOrder: (db.products || []).length + 1
  };

  if (!db.products) db.products = [];
  db.products.push(newProduct);
  await saveDb();

  res.status(201).json({ message: 'Product added successfully', product: newProduct });
});

// Update product (admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, defaultPrice, isSpecial } = req.body;

  const product = (db.products || []).find(p => p.id === id || p.name.toUpperCase() === id.toUpperCase());
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  if (name && name.trim()) {
    product.name = name.trim().toUpperCase();
  }
  if (defaultPrice !== undefined) {
    product.defaultPrice = Number(defaultPrice) || 0;
  }
  if (isSpecial !== undefined) {
    product.isSpecial = Boolean(isSpecial);
  }

  await saveDb();
  res.json({ message: 'Product updated', product });
});

// Remove / Deactivate product (admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const index = (db.products || []).findIndex(p => p.id === id || p.name.toUpperCase() === id.toUpperCase());
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const removed = db.products.splice(index, 1)[0];
  const removedName = (removed.name || '').toUpperCase();

  // Remove from all district assignments
  Object.keys(db.districtProducts || {}).forEach(dist => {
    db.districtProducts[dist] = (db.districtProducts[dist] || []).filter(p => 
      p.productId !== removed.id && 
      p.id !== removed.id && 
      (p.name || '').toUpperCase() !== removedName
    );
  });

  await saveDb();
  res.json({ message: 'Product removed', product: removed });
});

module.exports = router;
