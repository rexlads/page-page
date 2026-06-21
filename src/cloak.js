'use strict';

const { db, getSetting } = require('./db');
const { lookupCountry, clientIp, isVisible, isScheduledNow } = require('./geo');
const bots = require('./bots');

// Cache the bot-IP and datacenter-IP lists so we don't hit SQLite on every
// visit. Refreshed lazily; invalidated immediately when the admin edits them.
const TTL = 30 * 1000;
let _bot = { list: [], at: 0 };
let _dc = { list: [], at: 0 };
let _ua = { list: [], at: 0 };

function botCidrs() {
  if (Date.now() - _bot.at > TTL) {
    _bot = { list: db.prepare(`SELECT cidr FROM bot_ips`).all().map((r) => r.cidr), at: Date.now() };
  }
  return _bot.list;
}
function dcCidrs() {
  if (Date.now() - _dc.at > TTL) {
    _dc = { list: db.prepare(`SELECT cidr FROM dc_ips`).all().map((r) => r.cidr), at: Date.now() };
  }
  return _dc.list;
}
function uaBlocklist() {
  if (Date.now() - _ua.at > TTL) {
    const raw = getSetting('ua_blocklist', '') || '';
    _ua = { list: raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean), at: Date.now() };
  }
  return _ua.list;
}
function invalidateBotCache() {
  _bot.at = 0;
  _dc.at = 0;
  _ua.at = 0;
}

// Build everything we know about a visitor, once per request.
function buildContext(req) {
  const ua = req.headers['user-agent'] || '';
  const det = bots.detectBot(req, botCidrs(), uaBlocklist());
  let ip = clientIp(req);
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return {
    ua,
    ip,
    country: lookupCountry(req),
    isBot: det.isBot,
    botReason: det.reason,
    isDatacenter: bots.ipInList(ip, dcCidrs()),
    device: bots.deviceType(ua),
    os: bots.osType(ua),
    lang: bots.primaryLang(req),
    clickId: bots.hasClickId(req.query || {}),
    referrer: String(req.headers['referer'] || req.headers['referrer'] || '').toLowerCase(),
  };
}

function csv(s) {
  return String(s || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

// Evaluate ALL cloaking rules for an item (button or short link) against a
// visitor context. Returns true only if every active rule passes (AND logic).
function passes(item, ctx) {
  // 1) Geo allow/block
  if (!isVisible(item.cloak_mode, item.cloak_countries, ctx.country)) return false;

  // 2) Bots
  if (item.cloak_bots === 'hide' && ctx.isBot) return false;

  // 3) Datacenter / VPN / hosting IPs
  if (item.cloak_vpn === 'hide' && ctx.isDatacenter) return false;

  // 4) Require an ad click-id (fbclid/ttclid/gclid/…)
  if (item.cloak_click_id === 'require' && !ctx.clickId) return false;

  // 5) Device targeting
  if (item.cloak_devices && item.cloak_devices !== ctx.device) return false;

  // 6) OS targeting
  if (item.cloak_os && item.cloak_os !== ctx.os) return false;

  // 7) Language allow/block
  if (item.cloak_lang_mode && item.cloak_lang_mode !== 'off') {
    const list = csv(item.cloak_lang_list);
    if (list.length) {
      const match = list.includes(ctx.lang);
      if (item.cloak_lang_mode === 'allow' && !match) return false;
      if (item.cloak_lang_mode === 'block' && match) return false;
    }
  }

  // 8) Referrer allow/block
  if (item.cloak_ref_mode && item.cloak_ref_mode !== 'off') {
    const list = csv(item.cloak_ref_list);
    if (list.length) {
      const match = list.some((d) => ctx.referrer.includes(d));
      if (item.cloak_ref_mode === 'allow' && !match) return false;
      if (item.cloak_ref_mode === 'block' && match) return false;
    }
  }

  return true;
}

// Visibility for buttons additionally honours the schedule window.
function buttonVisible(btn, ctx) {
  return Boolean(btn.enabled) && passes(btn, ctx) && isScheduledNow(btn.start_at, btn.end_at);
}

module.exports = { buildContext, passes, buttonVisible, botCidrs, dcCidrs, invalidateBotCache };
