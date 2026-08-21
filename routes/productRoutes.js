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
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const { name, defaultPrice } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Product name is required' });
  }

  const trimmedName = name.trim();
  const existing = db.products.find(p => p.name.toLowerCase() === trimmedName.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'A product with this name already exists' });
  }

  const newProduct = {
    id: 'prod_' + Date.now() + Math.random().toString(36).slice(2, 6),
    name: trimmedName,
    defaultPrice: Number(defaultPrice) || 0,
    isActive: true,
    sortOrder: db.products.length + 1
  };

  db.products.push(newProduct);
  saveDb();

  res.status(201).json({ message: 'Product added successfully', product: newProduct });
});

// Update product (admin only)
router.put('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, defaultPrice } = req.body;

  const product = db.products.find(p => p.id === id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  if (name && name.trim()) {
    product.name = name.trim();
  }
  if (defaultPrice !== undefined) {
    product.defaultPrice = Number(defaultPrice) || 0;
  }

  saveDb();
  res.json({ message: 'Product updated', product });
});

// Remove / Deactivate product (admin only)
router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = db.products.findIndex(p => p.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const removed = db.products.splice(index, 1)[0];
  saveDb();
  res.json({ message: 'Product removed', product: removed });
});

module.exports = router;
