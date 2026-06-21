'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./src/config');

const adminRoutes = require('./src/routes/admin');
const publicRoutes = require('./src/routes/public');

const app = express();
app.set('trust proxy', true); // honour X-Forwarded-For so GeoIP sees the real visitor IP
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve uploaded media (avatars, icons).
app.use('/uploads', express.static(config.UPLOADS_DIR, { maxAge: '7d' }));

// Admin panel (static SPA).
app.use('/panel', express.static(path.join(__dirname, 'public', 'panel')));

// Admin API.
app.use('/api', adminRoutes);

// Health check.
app.get('/health', (req, res) => res.json({ ok: true }));

// Landing -> redirect to the panel by default.
app.get('/', (req, res) => res.redirect('/panel'));

// Public biolink pages + short-link redirects (must be last; it owns /:handle).
app.use('/', publicRoutes);

// 404
app.use((req, res) => res.status(404).send('404 Not Found'));

app.listen(config.PORT, () => {
  console.log(`\n  page-page running`);
  console.log(`  Panel : ${config.BASE_URL}/panel`);
  console.log(`  Login : ${config.ADMIN_USERNAME} (set in .env on first run)\n`);
});
