// api/index.js - Vercel Serverless Function Entrypoint
let app;
let loadError = null;

try {
  app = require('../server');
} catch (err) {
  loadError = err;
  console.error('Fatal error loading server.js on Vercel:', err);
}

module.exports = (req, res) => {
  if (req.url === '/api/health' || req.url === '/health' || req.url.startsWith('/api/health')) {
    if (loadError) {
      return res.status(500).json({
        status: 'load_error',
        error: loadError.message,
        stack: loadError.stack
      });
    }
    return res.status(200).json({
      status: 'ok',
      nodeVersion: process.version,
      env: process.env.NODE_ENV,
      hasDbUrl: Boolean(process.env.DATABASE_URL),
      time: new Date().toISOString()
    });
  }

  if (loadError) {
    return res.status(500).json({
      error: 'Module Load Error',
      message: loadError.message,
      stack: loadError.stack
    });
  }

  try {
    return app(req, res);
  } catch (invErr) {
    console.error('Request execution error:', invErr);
    return res.status(500).json({
      error: 'Execution Error',
      message: invErr.message,
      stack: invErr.stack
    });
  }
};
