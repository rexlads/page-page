'use strict';

const express = require('express');
const config = require('../config');
const { db, getSetting } = require('../db');
const { passes, buttonVisible, buildContext } = require('../cloak');

// Built-in theme presets. The panel can also send fully custom values.
const PRESETS = {
  midnight: { bg: 'linear-gradient(160deg,#0f172a,#1e293b)', text_color: '#f8fafc', accent: '#6366f1' },
  aurora: { bg: 'linear-gradient(160deg,#0f2027,#203a43,#2c5364)', text_color: '#eafff7', accent: '#2dd4bf' },
  sunset: { bg: 'linear-gradient(160deg,#42275a,#734b6d)', text_color: '#fff5f7', accent: '#fb7185' },
  candy: { bg: 'linear-gradient(160deg,#ff9a9e,#fecfef)', text_color: '#3a2330', accent: '#d946ef' },
  forest: { bg: 'linear-gradient(160deg,#134e5e,#71b280)', text_color: '#f0fff4', accent: '#34d399' },
  mono: { bg: '#0b0b0c', text_color: '#fafafa', accent: '#a3a3a3' },
  light: { bg: 'linear-gradient(160deg,#f8fafc,#e2e8f0)', text_color: '#0f172a', accent: '#6366f1' },
};

const FONTS = {
  Inter: 'Inter:wght@400;600;800',
  Poppins: 'Poppins:wght@400;600;800',
  Montserrat: 'Montserrat:wght@400;600;800',
  'Space Grotesk': 'Space+Grotesk:wght@400;600;700',
};

const router = express.Router();

function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function logEvent(type, ref_id, ctx) {
  try {
    db.prepare(
      `INSERT INTO events (type, ref_id, country, is_bot, ua, ip) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(type, ref_id, ctx.country, ctx.isBot ? 1 : 0, String(ctx.ua || '').slice(0, 300), ctx.ip || '');
  } catch (_) {}
}

// --- tracking pixels --------------------------------------------------------
// Effective pixels = global settings overlaid with this page's own pixels.
function effectivePixels(pagePixels) {
  let global = {};
  try {
    global = JSON.parse(getSetting('global_pixels', '{}') || '{}');
  } catch (_) {}
  const p = pagePixels || {};
  return {
    fb: p.fb || global.fb || '',
    tiktok: p.tiktok || global.tiktok || '',
    ga: p.ga || global.ga || '',
    custom_head: [global.custom_head, p.custom_head].filter(Boolean).join('\n'),
    custom_body: [global.custom_body, p.custom_body].filter(Boolean).join('\n'),
  };
}

function pixelHead(px) {
  let out = '';
  if (px.fb) {
    const id = esc(px.fb);
    out += `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${id}');fbq('track','PageView');</script>`;
  }
  if (px.tiktok) {
    const id = esc(px.tiktok);
    out += `<script>!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i='https://analytics.tiktok.com/i18n/pixel/events.js';ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=d.createElement('script');o.type='text/javascript';o.async=!0;o.src=i+'?sdkid='+e+'&lib='+t;var a=d.getElementsByTagName('script')[0];a.parentNode.insertBefore(o,a)};ttq.load('${id}');ttq.page()}(window,document,'ttq');</script>`;
  }
  if (px.ga) {
    const id = esc(px.ga);
    out += `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}');</script>`;
  }
  if (px.custom_head) out += px.custom_head; // trusted admin-supplied HTML
  return out;
}

// Fired client-side just before navigating away on a button tap.
function pixelClickScript(px) {
  if (!px.fb && !px.tiktok && !px.ga && !px.custom_body) return '';
  return `<script>
  (function(){
    function track(){try{
      if(window.fbq)fbq('track','Lead');
      if(window.ttq)ttq.track('ClickButton');
      if(window.gtag)gtag('event','select_content',{content_type:'button'});
    }catch(e){}}
    document.addEventListener('click',function(e){
      var a=e.target.closest('a.btn'); if(!a)return;
      e.preventDefault(); track();
      setTimeout(function(){window.location.href=a.getAttribute('href')},180);
    });
  })();
  </script>`;
}

// --- biolink HTML template -------------------------------------------------
function renderPage(page, buttons) {
  let theme = {};
  try {
    theme = JSON.parse(page.theme || '{}');
  } catch (_) {}
  let pagePixels = {};
  try {
    pagePixels = JSON.parse(page.pixels || '{}');
  } catch (_) {}
  const px = effectivePixels(pagePixels);

  const preset = PRESETS[theme.preset] || {};
  const bg = theme.bg || preset.bg || PRESETS.midnight.bg;
  const textColor = theme.text_color || preset.text_color || '#f8fafc';
  const accent = theme.accent || preset.accent || '#6366f1';
  const glass = theme.glass !== false; // frosted button background by default
  const animate = theme.animate !== false; // staggered entrance by default
  const fontName = FONTS[theme.font] ? theme.font : null;
  const fontStack = fontName ? `'${fontName}',system-ui,sans-serif` : 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';
  const fontLink = fontName
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=${FONTS[fontName]}&display=swap" rel="stylesheet">`
    : '';

  const radius = { filled: '14px', outline: '14px', soft: '14px', pill: '999px' };

  const buttonsHtml = buttons
    .map((b, i) => {
      const r = radius[b.style] || '14px';
      let style = '';
      if (b.style === 'outline') {
        style = `background:transparent;color:${esc(b.bg_color)};border:2px solid ${esc(b.bg_color)};`;
      } else if (b.style === 'soft') {
        style = `background:${esc(b.bg_color)}22;color:${esc(b.text_color)};border:1px solid ${esc(b.bg_color)}55;`;
      } else {
        style = `background:${esc(b.bg_color)};color:${esc(b.text_color)};border:none;`;
      }
      const delay = animate ? `style="${style}border-radius:${r};animation-delay:${0.05 * i + 0.1}s"` : `style="${style}border-radius:${r}"`;
      const icon = b.icon ? `<span class="icon">${esc(b.icon)}</span>` : '';
      return `<a class="btn ${animate ? 'in' : ''}" href="/r/b/${b.id}" ${delay}>${icon}<span>${esc(b.label)}</span><span class="arrow">↗</span></a>`;
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
<meta name="theme-color" content="${esc(accent)}">
${page.avatar ? `<meta property="og:image" content="${esc(page.avatar)}">` : ''}
${fontLink}
${pixelHead(px)}
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--accent:${esc(accent)}}
  body{font-family:${fontStack};min-height:100vh;background:${esc(bg)};background-attachment:fixed;
       color:${esc(textColor)};display:flex;justify-content:center;padding:56px 18px 40px}
  .wrap{width:100%;max-width:520px;text-align:center}
  .avatar{width:104px;height:104px;border-radius:50%;object-fit:cover;margin:0 auto 18px;display:block;
          border:3px solid ${esc(accent)};box-shadow:0 0 0 6px ${esc(accent)}22, 0 12px 30px rgba(0,0,0,.3)}
  .avatar.placeholder{display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:800;
          background:${esc(accent)};color:#fff}
  h1{font-size:23px;font-weight:800;margin-bottom:6px;display:flex;gap:6px;justify-content:center;align-items:center}
  .bio{opacity:.85;font-size:15px;margin-bottom:30px;white-space:pre-wrap;line-height:1.5}
  .btn{position:relative;display:flex;align-items:center;justify-content:center;gap:10px;width:100%;
       padding:16px 44px;margin-bottom:14px;text-decoration:none;font-weight:600;font-size:16px;
       backdrop-filter:${glass ? 'blur(6px)' : 'none'};
       box-shadow:0 6px 18px rgba(0,0,0,.18);transition:transform .12s ease,box-shadow .15s ease,filter .15s ease}
  .btn:hover{transform:translateY(-3px) scale(1.01);box-shadow:0 12px 26px rgba(0,0,0,.28);filter:brightness(1.06)}
  .btn:active{transform:translateY(-1px) scale(.99)}
  .btn .icon{font-size:19px}
  .btn .arrow{position:absolute;right:16px;opacity:0;transition:opacity .15s,transform .15s;transform:translateX(-4px)}
  .btn:hover .arrow{opacity:.7;transform:translateX(0)}
  .btn.in{opacity:0;transform:translateY(12px);animation:rise .5s ease forwards}
  @keyframes rise{to{opacity:1;transform:translateY(0)}}
  .empty{opacity:.7;font-size:15px}
  .footer{margin-top:34px;opacity:.55;font-size:12px}
  .footer a{color:inherit;font-weight:600}
  @media (prefers-reduced-motion: reduce){.btn.in{animation:none;opacity:1;transform:none}}
</style>
</head>
<body>
  <main class="wrap">
    ${avatar}
    <h1>${esc(page.title || page.slug)}</h1>
    ${page.description ? `<p class="bio">${esc(page.description)}</p>` : ''}
    ${buttonsHtml || '<p class="empty">Belum ada tombol yang tersedia.</p>'}
    <div class="footer">⚡ Dibuat dengan <a href="/panel">page-page</a></div>
  </main>
  ${px.custom_body || ''}
  ${pixelClickScript(px)}
</body>
</html>`;
}

// --- button click tracker + redirect ---------------------------------------
router.get('/r/b/:id', (req, res) => {
  const btn = db.prepare(`SELECT * FROM buttons WHERE id = ?`).get(req.params.id);
  if (!btn || !btn.url) return res.status(404).send('Link tidak ditemukan');

  const ctx = buildContext(req);
  // Re-check all cloaking + schedule so a shared/cached direct link can't bypass them.
  if (!buttonVisible(btn, ctx)) {
    return res.status(404).send('Link tidak tersedia saat ini');
  }
  // Don't inflate click stats with bots.
  if (!ctx.isBot) db.prepare(`UPDATE buttons SET clicks = clicks + 1 WHERE id = ?`).run(btn.id);
  logEvent('button_click', btn.id, ctx);
  res.redirect(302, btn.url);
});

// --- unified resolver for /:handle (biolink page OR short link) -------------
router.get('/:handle', (req, res, next) => {
  const handle = req.params.handle;
  if (config.RESERVED.has(handle.toLowerCase())) return next();

  const ctx = buildContext(req);

  // 1) Try a biolink page.
  const page = db.prepare(`SELECT * FROM pages WHERE slug = ? AND published = 1`).get(handle);
  if (page) {
    const all = db.prepare(`SELECT * FROM buttons WHERE page_id = ? ORDER BY sort_order, id`).all(page.id);
    const visible = all.filter((b) => buttonVisible(b, ctx));
    if (!ctx.isBot) db.prepare(`UPDATE pages SET views = views + 1 WHERE id = ?`).run(page.id);
    logEvent('page_view', page.id, ctx);
    res.set('Cache-Control', 'no-store'); // geo-specific output must not be cached
    return res.send(renderPage(page, visible));
  }

  // 2) Try a short link. All cloaking rules apply; blocked/bot visitors get the
  //    safe fallback URL if set, otherwise a 404.
  const link = db.prepare(`SELECT * FROM short_links WHERE code = ? AND enabled = 1`).get(handle);
  if (link) {
    if (!passes(link, ctx)) {
      logEvent('short_blocked', link.id, ctx);
      if (link.cloak_fallback) return res.redirect(302, link.cloak_fallback);
      return res.status(404).send('Link tidak tersedia di wilayah Anda');
    }
    if (!ctx.isBot) db.prepare(`UPDATE short_links SET clicks = clicks + 1 WHERE id = ?`).run(link.id);
    logEvent('short_click', link.id, ctx);
    return res.redirect(302, link.target_url);
  }

  return next();
});

module.exports = router;
