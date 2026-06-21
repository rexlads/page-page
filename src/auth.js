'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const config = require('./config');
const { getSetting, setSetting } = require('./db');

const COOKIE = 'pp_token';

function verifyCredentials(username, password) {
  const user = getSetting('admin_username');
  const hash = getSetting('admin_password');
  if (!user || !hash) return false;
  if (username !== user) return false;
  return bcrypt.compareSync(password, hash);
}

function issueToken(username) {
  return jwt.sign({ sub: username }, config.JWT_SECRET, { expiresIn: '7d' });
}

function changePassword(newPassword) {
  setSetting('admin_password', bcrypt.hashSync(newPassword, 10));
}

// Express middleware that guards the admin API.
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, config.JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { COOKIE, verifyCredentials, issueToken, changePassword, requireAuth };
