// api/index.js - Vercel Serverless Function Entrypoint
const app = require('../server');
const { initDb } = require('../config/db');

let lastInitTime = 0;

module.exports = async (req, res) => {
  if (Date.now() - lastInitTime > 4000) {
    try {
      await initDb();
      lastInitTime = Date.now();
    } catch (e) {
      console.error('Vercel initDb warning:', e.message);
    }
  }
  return app(req, res);
};
