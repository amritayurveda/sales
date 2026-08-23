// middleware/auth.js
const jwt = require('jsonwebtoken');
const { db } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'sales-register-pro-secure-key-2026';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired session token' });
    }

    const user = db.users.find(u => u.id === decoded.id);
    if (!user) {
      return res.status(403).json({ error: 'User account not found' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      district: user.district
    };
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator privileges required' });
  }
  next();
}

/**
 * Ensures a dealer can only access data for their assigned district.
 * Admin can access any district.
 */
function enforceDistrictAccess(req, res, next) {
  const targetDistrict = req.params.district || req.body.district || req.query.district;
  if (!targetDistrict) {
    return next();
  }

  if (req.user.role === 'admin') {
    return next();
  }

  const userDist = (req.user.district || '').trim().toLowerCase();
  const targetDist = (targetDistrict || '').trim().toLowerCase();

  if (req.user.role === 'dealer' && userDist !== targetDist) {
    return res.status(403).json({
      error: `Unauthorized: You only have access to district '${req.user.district}'`
    });
  }

  next();
}

module.exports = {
  JWT_SECRET,
  authenticateToken,
  requireAdmin,
  enforceDistrictAccess
};
