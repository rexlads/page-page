'use strict';

const express = require('express');
const config = require('../config');
const { db } = require('../db');
const { lookupCountry, isVisible } = require('../geo');

const router = express.Router();

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function logEvent(type, ref_id, country) {
  try {
    db.prepare(`INSERT INTO events (type, ref_id, country) VALUES (?, ?, ?)`).run(type, ref_id, country);
  } catch (_) {}
}

// --- biolink HTML template -------------------------------------------------
function renderPage(page, buttons) {
  let theme = {};
  try {
    theme = JSON.parse(page.theme || '{}');
  } catch (_) {}
  const bg = theme.bg || 'linear-gradient(160deg,#0f172a,#1e293b)';
  const textColor = theme.text_color || '#f8fafc';
  const accent = theme.accent || '#6366f1';

  const radius = { filled: '14px', outline: '14px', soft: '14px', pill: '999px' };

  const buttonsHtml = buttons
    .map((b) => {
      const r = radius[b.style] || '14px';
      let style = '';
      if (b.style === 'outline') {
        style = `background:transparent;color:${esc(b.bg_color)};border:2px solid ${esc(b.bg_color)};`;
      } else if (b.style === 'soft') {
        style = `background:${esc(b.bg_color)}22;color:${esc(b.text_color)};border:1px solid ${esc(b.bg_color)}55;`;
      } else {
        style = `background:${esc(b.bg_color)};color:${esc(b.text_color)};border:none;`;
      }
      const icon = b.icon ? `<span class="icon">${esc(b.icon)}</span>` : '';
      return `<a class="btn" href="/r/b/${b.id}" style="${style}border-radius:${r}">${icon}<span>${esc(b.label)}</span></a>`;
    })
    .join('\n');

  const avatar = page.avatar
    ? `<img class="avatar" src="${esc(page.avatar)}" alt="${esc(page.title)}">`
    : `<div class="avatar placeholder">${esc((page.title || '?').charAt(0).toUpperCase())}</div>`;

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title || page.slug)}</title>
<meta name="description" content="${esc(page.description)}">
<meta property="og:title" content="${esc(page.title || page.slug)}">
<meta property="og:description" content="${esc(page.description)}">
${page.avatar ? `<meta property="og:image" content="${esc(page.avatar)}">` : ''}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;
       background:${esc(bg)};color:${esc(textColor)};display:flex;justify-content:center;padding:48px 18px}
  .wrap{width:100%;max-width:520px;text-align:center}
  .avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;margin:0 auto 16px;display:block;
          border:3px solid rgba(255,255,255,.25)}
  .avatar.placeholder{display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:700;
          background:${esc(accent)};color:#fff}
  h1{font-size:22px;margin-bottom:6px}
  .bio{opacity:.85;font-size:15px;margin-bottom:28px;white-space:pre-wrap}
  .btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:15px 18px;
       margin-bottom:14px;text-decoration:none;font-weight:600;font-size:16px;transition:transform .08s ease,filter .15s ease}
  .btn:hover{transform:translateY(-2px);filter:brightness(1.07)}
  .btn .icon{font-size:18px}
  .footer{margin-top:32px;opacity:.5;font-size:12px}
  .footer a{color:inherit}
</style>
</head>
<body>
  <main class="wrap">
    ${avatar}
    <h1>${esc(page.title || page.slug)}</h1>
    ${page.description ? `<p class="bio">${esc(page.description)}</p>` : ''}
    ${buttonsHtml || '<p class="bio">Belum ada tombol yang tersedia.</p>'}
    <div class="footer">Powered by <a href="/panel">page-page</a></div>
  </main>
</body>
</html>`;
}

// --- button click tracker + redirect ---------------------------------------
router.get('/r/b/:id', (req, res) => {
  const btn = db.prepare(`SELECT * FROM buttons WHERE id = ?`).get(req.params.id);
  if (!btn || !btn.url) return res.status(404).send('Link tidak ditemukan');

  const country = lookupCountry(req);
  // Re-check cloaking so a shared/cached direct link can't bypass the geo rule.
  if (!btn.enabled || !isVisible(btn.cloak_mode, btn.cloak_countries, country)) {
    return res.status(404).send('Link tidak tersedia di wilayah Anda');
  }
  db.prepare(`UPDATE buttons SET clicks = clicks + 1 WHERE id = ?`).run(btn.id);
  logEvent('button_click', btn.id, country);
  res.redirect(302, btn.url);
});

// --- unified resolver for /:handle (biolink page OR short link) -------------
router.get('/:handle', (req, res, next) => {
  const handle = req.params.handle;
  if (config.RESERVED.has(handle.toLowerCase())) return next();

  const country = lookupCountry(req);

  // 1) Try a biolink page.
  const page = db.prepare(`SELECT * FROM pages WHERE slug = ? AND published = 1`).get(handle);
  if (page) {
    const all = db.prepare(`SELECT * FROM buttons WHERE page_id = ? ORDER BY sort_order, id`).all(page.id);
    const visible = all.filter((b) => b.enabled && isVisible(b.cloak_mode, b.cloak_countries, country));
    db.prepare(`UPDATE pages SET views = views + 1 WHERE id = ?`).run(page.id);
    logEvent('page_view', page.id, country);
    res.set('Cache-Control', 'no-store'); // geo-specific output must not be cached
    return res.send(renderPage(page, visible));
  }

  // 2) Try a short link.
  const link = db.prepare(`SELECT * FROM short_links WHERE code = ? AND enabled = 1`).get(handle);
  if (link) {
    if (!isVisible(link.cloak_mode, link.cloak_countries, country)) {
      logEvent('short_blocked', link.id, country);
      if (link.cloak_fallback) return res.redirect(302, link.cloak_fallback);
      return res.status(404).send('Link tidak tersedia di wilayah Anda');
    }
    db.prepare(`UPDATE short_links SET clicks = clicks + 1 WHERE id = ?`).run(link.id);
    logEvent('short_click', link.id, country);
    return res.redirect(302, link.target_url);
  }

  return next();
});

module.exports = router;
