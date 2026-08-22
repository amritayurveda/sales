// api/index.js - Vercel Serverless Function Entrypoint
const app = require('../server');
const { initDb } = require('../config/db');

let initPromise = null;

module.exports = async (req, res) => {
  if (!initPromise) {
    initPromise = initDb().catch(err => {
      console.error('Vercel initDb error:', err);
      initPromise = null;
    });
  }
  try {
    await initPromise;
  } catch (e) {
    console.error('Vercel await initPromise error:', e);
  }
  return app(req, res);
};
