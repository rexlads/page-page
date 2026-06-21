'use strict';

const { db } = require('./db');
const { lookupCountry, clientIp, isVisible, isScheduledNow } = require('./geo');
const bots = require('./bots');

// Cache the bot-IP list so we don't hit SQLite on every visit. Refreshed
// lazily, and invalidated immediately when the admin edits the list.
let _cache = { list: [], at: 0 };
const TTL = 30 * 1000;

function botCidrs() {
  const now = Date.now();
  if (now - _cache.at > TTL) {
    _cache = { list: db.prepare(`SELECT cidr FROM bot_ips`).all().map((r) => r.cidr), at: now };
  }
  return _cache.list;
}
function invalidateBotCache() {
  _cache.at = 0;
}

// Build everything we know about a visitor, once per request.
function buildContext(req) {
  const ua = req.headers['user-agent'] || '';
  const det = bots.detectBot(req, botCidrs());
  let ip = clientIp(req);
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return {
    ua,
    ip,
    country: lookupCountry(req),
    isBot: det.isBot,
    botReason: det.reason,
    device: bots.deviceType(ua),
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

  // 3) Device targeting
  if (item.cloak_devices && item.cloak_devices !== ctx.device) return false;

  // 4) Referrer allow/block
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

module.exports = { buildContext, passes, buttonVisible, botCidrs, invalidateBotCache };
