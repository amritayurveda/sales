// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../config/db');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { getServerToday } = require('../middleware/sameDayCheck');

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const cleanUser = username.trim().toLowerCase();
  const user = db.users.find(u => u.username.toLowerCase() === cleanUser);

  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const isMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const tokenPayload = {
    id: user.id,
    username: user.username,
    role: user.role,
    district: user.district
  };

  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

  // Log user activity
  const { logActivity } = require('../config/db');
  logActivity(
    user.id,
    user.username,
    user.role,
    user.district,
    'LOGIN',
    `User ${user.username} (${user.role}${user.district ? ` - ${user.district}` : ''}) logged in`
  );

  res.json({
    message: 'Authentication successful',
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      district: user.district
    },
    serverToday: getServerToday()
  });
});

// Current User Profile
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    user: req.user,
    serverToday: getServerToday()
  });
});

// Helper for UI dealer quick selection / demo accounts
router.get('/dealers-list', (req, res) => {
  const dealers = db.users
    .filter(u => u.role === 'dealer')
    .map(u => ({
      username: u.username,
      name: u.name,
      district: u.district
    }));

  res.json({ dealers });
});

module.exports = router;
