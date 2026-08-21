// api/index.js - Vercel Serverless Function Entrypoint
const app = require('../server');
const { initDb } = require('../config/db');

let isInitialized = false;

module.exports = async (req, res) => {
  if (!isInitialized) {
    try {
      await initDb();
      isInitialized = true;
    } catch (e) {
      console.error('Vercel initDb warning:', e.message);
    }
  }
  return app(req, res);
};
