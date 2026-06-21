'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const { nanoid } = require('nanoid');
const config = require('../config');
const { db, getSetting, setSetting } = require('../db');
const auth = require('../auth');
const { exportAll, importAll } = require('../backup');
const { invalidateBotCache } = require('../cloak');

const router = express.Router();

// --- uploads (avatars / button icons) --------------------------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, config.UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
const memoryUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ===========================================================================
// AUTH (public sub-routes)
// ===========================================================================
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!auth.verifyCredentials(username, password)) {
    return res.status(401).json({ error: 'Username atau password salah' });
  }
  const token = auth.issueToken(username);
  res.cookie(auth.COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true, username });
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie(auth.COOKIE);
  res.json({ ok: true });
});

router.get('/auth/me', auth.requireAuth, (req, res) => {
  res.json({ username: req.user.sub });
});

// Everything below requires a valid session.
router.use(auth.requireAuth);

// ===========================================================================
// SETTINGS
// ===========================================================================
router.get('/settings', (req, res) => {
  let globalPixels = {};
  try {
    globalPixels = JSON.parse(getSetting('global_pixels', '{}') || '{}');
  } catch (_) {}
  res.json({
    site_title: getSetting('site_title', 'page-page'),
    admin_username: getSetting('admin_username', 'admin'),
    base_url: config.BASE_URL,
    global_pixels: globalPixels,
  });
});

router.put('/settings', (req, res) => {
  const { site_title, global_pixels } = req.body || {};
  if (typeof site_title === 'string') setSetting('site_title', site_title);
  if (global_pixels && typeof global_pixels === 'object') {
    setSetting('global_pixels', JSON.stringify(global_pixels));
  }
  res.json({ ok: true });
});

// --- bot IP list (used by the cloaking engine + analytics) ------------------
router.get('/botips', (req, res) => {
  res.json(db.prepare(`SELECT * FROM bot_ips ORDER BY created_at DESC`).all());
});

router.post('/botips', (req, res) => {
  const cidr = String((req.body && req.body.cidr) || '').trim();
  const note = String((req.body && req.body.note) || '').trim();
  // Accept a bare IPv4 or an IPv4 CIDR.
  if (!/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(cidr)) {
    return res.status(400).json({ error: 'Format harus IPv4 atau CIDR, mis. 1.2.3.4 atau 1.2.3.0/24' });
  }
  try {
    const info = db.prepare(`INSERT INTO bot_ips (cidr, note) VALUES (?, ?)`).run(cidr, note);
    invalidateBotCache();
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(409).json({ error: 'IP/CIDR sudah ada di daftar' });
  }
});

router.delete('/botips/:id', (req, res) => {
  db.prepare(`DELETE FROM bot_ips WHERE id = ?`).run(req.params.id);
  invalidateBotCache();
  res.json({ ok: true });
});

router.post('/settings/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.verifyCredentials(getSetting('admin_username'), current)) {
    return res.status(400).json({ error: 'Password saat ini salah' });
  }
  if (!next || String(next).length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  }
  auth.changePassword(next);
  res.json({ ok: true });
});

// ===========================================================================
// UPLOADS
// ===========================================================================
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

// ===========================================================================
// PAGES (biolinks)
// ===========================================================================
function reserved(slug) {
  return config.RESERVED.has(String(slug).toLowerCase());
}
function slugTaken(slug, exceptId = 0) {
  const p = db.prepare(`SELECT id FROM pages WHERE slug = ? AND id != ?`).get(slug, exceptId);
  const s = db.prepare(`SELECT id FROM short_links WHERE code = ?`).get(slug);
  return Boolean(p || s);
}

router.get('/pages', (req, res) => {
  const pages = db.prepare(`SELECT * FROM pages ORDER BY created_at DESC`).all();
  for (const p of pages) {
    p.buttons_count = db.prepare(`SELECT COUNT(*) AS n FROM buttons WHERE page_id = ?`).get(p.id).n;
  }
  res.json(pages);
});

router.get('/pages/:id', (req, res) => {
  const page = db.prepare(`SELECT * FROM pages WHERE id = ?`).get(req.params.id);
  if (!page) return res.status(404).json({ error: 'Not found' });
  page.buttons = db
    .prepare(`SELECT * FROM buttons WHERE page_id = ? ORDER BY sort_order, id`)
    .all(page.id);
  res.json(page);
});

router.post('/pages', (req, res) => {
  const { slug, title = '', description = '', avatar = '', theme = {}, pixels = {} } = req.body || {};
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug hanya boleh huruf, angka, - dan _' });
  }
  if (reserved(slug)) return res.status(400).json({ error: 'Slug ini dipakai sistem' });
  if (slugTaken(slug)) return res.status(409).json({ error: 'Slug sudah dipakai' });

  const info = db
    .prepare(
      `INSERT INTO pages (slug, title, description, avatar, theme, pixels) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(slug, title, description, avatar, JSON.stringify(theme || {}), JSON.stringify(pixels || {}));
  res.json({ id: info.lastInsertRowid });
});

router.put('/pages/:id', (req, res) => {
  const page = db.prepare(`SELECT * FROM pages WHERE id = ?`).get(req.params.id);
  if (!page) return res.status(404).json({ error: 'Not found' });

  const { slug, title, description, avatar, theme, published, pixels } = req.body || {};
  if (slug && slug !== page.slug) {
    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ error: 'Slug tidak valid' });
    if (reserved(slug)) return res.status(400).json({ error: 'Slug ini dipakai sistem' });
    if (slugTaken(slug, page.id)) return res.status(409).json({ error: 'Slug sudah dipakai' });
  }

  db.prepare(
    `UPDATE pages SET
       slug = ?, title = ?, description = ?, avatar = ?, theme = ?, published = ?, pixels = ?,
       updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    slug ?? page.slug,
    title ?? page.title,
    description ?? page.description,
    avatar ?? page.avatar,
    theme !== undefined ? JSON.stringify(theme) : page.theme,
    published !== undefined ? (published ? 1 : 0) : page.published,
    pixels !== undefined ? JSON.stringify(pixels) : page.pixels,
    page.id
  );
  res.json({ ok: true });
});

router.delete('/pages/:id', (req, res) => {
  db.prepare(`DELETE FROM pages WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ===========================================================================
// BUTTONS
// ===========================================================================
function sanitizeButton(body, page_id) {
  return {
    page_id,
    label: body.label ?? '',
    url: body.url ?? '',
    icon: body.icon ?? '',
    bg_color: body.bg_color ?? '#111827',
    text_color: body.text_color ?? '#ffffff',
    style: ['filled', 'outline', 'soft', 'pill'].includes(body.style) ? body.style : 'filled',
    sort_order: Number.isFinite(+body.sort_order) ? +body.sort_order : 0,
    enabled: body.enabled === false || body.enabled === 0 ? 0 : 1,
    cloak_mode: ['off', 'allow', 'block'].includes(body.cloak_mode) ? body.cloak_mode : 'off',
    cloak_countries: String(body.cloak_countries || '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)
      .join(','),
    start_at: body.start_at ? String(body.start_at) : '',
    end_at: body.end_at ? String(body.end_at) : '',
    ...sanitizeCloakExtras(body),
  };
}

// Advanced cloaking fields shared by buttons and short links.
function sanitizeCloakExtras(body) {
  return {
    cloak_bots: body.cloak_bots === 'hide' ? 'hide' : 'off',
    cloak_devices: ['mobile', 'desktop'].includes(body.cloak_devices) ? body.cloak_devices : '',
    cloak_ref_mode: ['off', 'allow', 'block'].includes(body.cloak_ref_mode) ? body.cloak_ref_mode : 'off',
    cloak_ref_list: String(body.cloak_ref_list || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .join(','),
  };
}

router.post('/pages/:id/buttons', (req, res) => {
  const page = db.prepare(`SELECT id FROM pages WHERE id = ?`).get(req.params.id);
  if (!page) return res.status(404).json({ error: 'Page not found' });

  const b = sanitizeButton(req.body || {}, page.id);
  const max = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM buttons WHERE page_id = ?`).get(page.id).m;
  b.sort_order = max + 1;

  const info = db
    .prepare(
      `INSERT INTO buttons (page_id, label, url, icon, bg_color, text_color, style, sort_order, enabled,
         cloak_mode, cloak_countries, start_at, end_at, cloak_bots, cloak_devices, cloak_ref_mode, cloak_ref_list)
       VALUES (@page_id, @label, @url, @icon, @bg_color, @text_color, @style, @sort_order, @enabled,
         @cloak_mode, @cloak_countries, @start_at, @end_at, @cloak_bots, @cloak_devices, @cloak_ref_mode, @cloak_ref_list)`
    )
    .run(b);
  res.json({ id: info.lastInsertRowid });
});

router.put('/buttons/:id', (req, res) => {
  const btn = db.prepare(`SELECT * FROM buttons WHERE id = ?`).get(req.params.id);
  if (!btn) return res.status(404).json({ error: 'Not found' });
  const b = sanitizeButton({ ...btn, ...req.body }, btn.page_id);
  b.id = btn.id;
  db.prepare(
    `UPDATE buttons SET
       label=@label, url=@url, icon=@icon, bg_color=@bg_color, text_color=@text_color,
       style=@style, enabled=@enabled, cloak_mode=@cloak_mode, cloak_countries=@cloak_countries,
       start_at=@start_at, end_at=@end_at,
       cloak_bots=@cloak_bots, cloak_devices=@cloak_devices, cloak_ref_mode=@cloak_ref_mode, cloak_ref_list=@cloak_ref_list
     WHERE id=@id`
  ).run(b);
  res.json({ ok: true });
});

router.delete('/buttons/:id', (req, res) => {
  db.prepare(`DELETE FROM buttons WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// Persist a new drag-and-drop order: body = { order: [id1, id2, ...] }
router.post('/buttons/reorder', (req, res) => {
  const ids = Array.isArray(req.body.order) ? req.body.order : [];
  const stmt = db.prepare(`UPDATE buttons SET sort_order = ? WHERE id = ?`);
  const txn = db.transaction(() => ids.forEach((id, i) => stmt.run(i, id)));
  txn();
  res.json({ ok: true });
});

// ===========================================================================
// SHORT LINKS
// ===========================================================================
router.get('/links', (req, res) => {
  res.json(db.prepare(`SELECT * FROM short_links ORDER BY created_at DESC`).all());
});

router.post('/links', (req, res) => {
  let { code, target_url, title = '', cloak_mode = 'off', cloak_countries = '', cloak_fallback = '' } = req.body || {};
  if (!target_url || !/^https?:\/\//i.test(target_url)) {
    return res.status(400).json({ error: 'Target URL harus diawali http:// atau https://' });
  }
  code = (code || nanoid(6)).trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) return res.status(400).json({ error: 'Kode tidak valid' });
  if (reserved(code)) return res.status(400).json({ error: 'Kode ini dipakai sistem' });
  if (slugTaken(code)) return res.status(409).json({ error: 'Kode sudah dipakai' });

  cloak_countries = String(cloak_countries).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean).join(',');
  const ex = sanitizeCloakExtras(req.body || {});
  const info = db
    .prepare(
      `INSERT INTO short_links (code, target_url, title, cloak_mode, cloak_countries, cloak_fallback,
         cloak_bots, cloak_devices, cloak_ref_mode, cloak_ref_list)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      code, target_url, title,
      ['off', 'allow', 'block'].includes(cloak_mode) ? cloak_mode : 'off',
      cloak_countries, cloak_fallback,
      ex.cloak_bots, ex.cloak_devices, ex.cloak_ref_mode, ex.cloak_ref_list
    );
  res.json({ id: info.lastInsertRowid, code, short_url: `${config.BASE_URL}/${code}` });
});

router.put('/links/:id', (req, res) => {
  const link = db.prepare(`SELECT * FROM short_links WHERE id = ?`).get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Not found' });
  let { target_url, title, enabled, cloak_mode, cloak_countries, cloak_fallback } = req.body || {};
  if (target_url && !/^https?:\/\//i.test(target_url)) {
    return res.status(400).json({ error: 'Target URL tidak valid' });
  }
  const cc =
    cloak_countries !== undefined
      ? String(cloak_countries).split(',').map((c) => c.trim().toUpperCase()).filter(Boolean).join(',')
      : link.cloak_countries;
  const ex = sanitizeCloakExtras({
    cloak_bots: req.body.cloak_bots ?? link.cloak_bots,
    cloak_devices: req.body.cloak_devices ?? link.cloak_devices,
    cloak_ref_mode: req.body.cloak_ref_mode ?? link.cloak_ref_mode,
    cloak_ref_list: req.body.cloak_ref_list ?? link.cloak_ref_list,
  });
  db.prepare(
    `UPDATE short_links SET target_url=?, title=?, enabled=?, cloak_mode=?, cloak_countries=?, cloak_fallback=?,
       cloak_bots=?, cloak_devices=?, cloak_ref_mode=?, cloak_ref_list=? WHERE id=?`
  ).run(
    target_url ?? link.target_url,
    title ?? link.title,
    enabled !== undefined ? (enabled ? 1 : 0) : link.enabled,
    cloak_mode && ['off', 'allow', 'block'].includes(cloak_mode) ? cloak_mode : link.cloak_mode,
    cc,
    cloak_fallback ?? link.cloak_fallback,
    ex.cloak_bots, ex.cloak_devices, ex.cloak_ref_mode, ex.cloak_ref_list,
    link.id
  );
  res.json({ ok: true });
});

router.delete('/links/:id', (req, res) => {
  db.prepare(`DELETE FROM short_links WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// ===========================================================================
// STATS (lightweight dashboard numbers)
// ===========================================================================
router.get('/stats', (req, res) => {
  const n = (sql) => db.prepare(sql).get().n;
  res.json({
    pages: n(`SELECT COUNT(*) AS n FROM pages`),
    buttons: n(`SELECT COUNT(*) AS n FROM buttons`),
    links: n(`SELECT COUNT(*) AS n FROM short_links`),
    page_views: n(`SELECT COALESCE(SUM(views),0) AS n FROM pages`),
    button_clicks: n(`SELECT COALESCE(SUM(clicks),0) AS n FROM buttons`),
    link_clicks: n(`SELECT COALESCE(SUM(clicks),0) AS n FROM short_links`),
  });
});

// ===========================================================================
// ANALYTICS (per-country + over time, from the events log)
// ===========================================================================
router.get('/analytics', (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days || '30', 10) || 30, 1), 365);
  const since = `-${days} days`;

  const byCountry = db
    .prepare(
      `SELECT country, COUNT(*) AS n FROM events
       WHERE type IN ('button_click','short_click','page_view')
         AND created_at >= datetime('now', ?)
       GROUP BY country ORDER BY n DESC LIMIT 20`
    )
    .all(since);

  const byType = db
    .prepare(
      `SELECT type, COUNT(*) AS n FROM events
       WHERE created_at >= datetime('now', ?) GROUP BY type`
    )
    .all(since);

  const daily = db
    .prepare(
      `SELECT date(created_at) AS day,
              SUM(type='page_view')   AS views,
              SUM(type IN ('button_click','short_click')) AS clicks
       FROM events WHERE created_at >= datetime('now', ?)
       GROUP BY day ORDER BY day`
    )
    .all(since);

  const blocked = db
    .prepare(
      `SELECT COUNT(*) AS n FROM events
       WHERE type='short_blocked' AND created_at >= datetime('now', ?)`
    )
    .get(since).n;

  const topPages = db.prepare(`SELECT slug, title, views FROM pages ORDER BY views DESC LIMIT 5`).all();
  const topLinks = db.prepare(`SELECT code, title, clicks FROM short_links ORDER BY clicks DESC LIMIT 5`).all();
  const topButtons = db
    .prepare(`SELECT label, clicks FROM buttons ORDER BY clicks DESC LIMIT 5`)
    .all();

  // Bot vs human split (across all tracked traffic in range).
  const split = db
    .prepare(
      `SELECT is_bot, COUNT(*) AS n FROM events
       WHERE created_at >= datetime('now', ?) GROUP BY is_bot`
    )
    .all(since);
  const humans = (split.find((s) => s.is_bot === 0) || {}).n || 0;
  const botCount = (split.find((s) => s.is_bot === 1) || {}).n || 0;

  const topBotIps = db
    .prepare(
      `SELECT ip, country, COUNT(*) AS n FROM events
       WHERE is_bot = 1 AND ip != '' AND created_at >= datetime('now', ?)
       GROUP BY ip ORDER BY n DESC LIMIT 12`
    )
    .all(since);

  const recentBots = db
    .prepare(
      `SELECT type, ip, country, ua, created_at FROM events
       WHERE is_bot = 1 AND created_at >= datetime('now', ?)
       ORDER BY id DESC LIMIT 15`
    )
    .all(since);

  res.json({
    days, byCountry, byType, daily, blocked, topPages, topLinks, topButtons,
    humans, bots: botCount, topBotIps, recentBots,
  });
});

// ===========================================================================
// QR CODE (PNG) for any of your links
// ===========================================================================
router.get('/qr', async (req, res) => {
  const data = req.query.data;
  if (!data) return res.status(400).json({ error: 'data kosong' });
  try {
    const png = await QRCode.toBuffer(String(data), {
      width: 600,
      margin: 2,
      color: { dark: '#0b1120', light: '#ffffff' },
    });
    res.type('png').setHeader('Cache-Control', 'no-store').send(png);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ===========================================================================
// BACKUP: export / import the whole domain (DB + uploads)
// ===========================================================================
router.get('/backup/export', async (req, res) => {
  try {
    const { buffer } = await exportAll();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="page-page-backup-${stamp}.zip"`);
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/backup/import', memoryUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih file backup .zip' });
  try {
    const result = importAll(req.file.buffer);
    invalidateBotCache();
    res.json({ ok: true, restored: result });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
