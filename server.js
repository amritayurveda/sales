// server.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDb } = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Database Initialization Middleware for Serverless & Local
let dbReady = false;
let dbInitPromise = null;
app.use(async (req, res, next) => {
  if (!dbReady) {
    if (!dbInitPromise) {
      dbInitPromise = initDb().then(() => {
        dbReady = true;
      }).catch(err => {
        console.error('Database initialization error:', err.message);
        dbInitPromise = null;
      });
    }
    try {
      await dbInitPromise;
    } catch (e) {
      // Continue to handlers
    }
  }
  next();
});

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API Routes (Mounted on both /api/* and /* for full compatibility with Vercel and standalone servers)
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const dcRoutes = require('./routes/dcRoutes');
const salesRoutes = require('./routes/salesRoutes');
const ledgerRoutes = require('./routes/ledgerRoutes');
const adminRoutes = require('./routes/adminRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const cashRoutes = require('./routes/cashRoutes');
const sheetsRoutes = require('./routes/sheetsRoutes');

app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/products', '/products'], productRoutes);
app.use(['/api/dc-rules', '/dc-rules'], dcRoutes);
app.use(['/api/sales', '/sales'], salesRoutes);
app.use(['/api/ledger', '/ledger'], ledgerRoutes);
app.use(['/api/admin', '/admin'], adminRoutes);
app.use(['/api/inventory', '/inventory'], inventoryRoutes);
app.use(['/api/orders', '/orders'], orderRoutes);
app.use(['/api/cash', '/cash'], cashRoutes);
app.use(['/api/sheets', '/sheets'], sheetsRoutes);

// Safe Fallback to index.html for SPA (Never send meta refresh)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  } else if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  } else {
    return res.status(404).send('Not Found');
  }
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
