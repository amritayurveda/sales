// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDb } = require('./config/db');

// Initialize database
initDb().catch(err => console.error('Database initialization warning:', err.message));

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/dc-rules', require('./routes/dcRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/ledger', require('./routes/ledgerRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/cash', require('./routes/cashRoutes'));
app.use('/api/sheets', require('./routes/sheetsRoutes'));

// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

async function startServer() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`Sales Register Pro Server running at:`);
    console.log(`http://localhost:${PORT}`);
    console.log(`Connected to Neon PostgreSQL Database!`);
    console.log(`=================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
