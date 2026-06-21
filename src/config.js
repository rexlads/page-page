'use strict';

const path = require('path');
require('dotenv').config();

const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  BASE_URL: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  JWT_SECRET: process.env.JWT_SECRET || 'insecure-default-secret-change-me',
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  DATA_DIR,
  DB_PATH: path.join(DATA_DIR, 'app.db'),
  UPLOADS_DIR: path.join(DATA_DIR, 'uploads'),
  // Handles that can never be used as a page slug or short code.
  RESERVED: new Set([
    'panel', 'api', 'r', 'assets', 'static', 'public', 'admin',
    'login', 'logout', 'favicon.ico', 'robots.txt', 's', 'go', 'health'
  ]),
};
