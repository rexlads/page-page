'use strict';

const geoip = require('geoip-lite');

// Pull the visitor's real IP, honouring common proxy headers.
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || '';
}

// Resolve a visitor's ISO 3166-1 alpha-2 country code (e.g. "ID", "US").
// Order of trust: Cloudflare header -> generic header -> offline GeoIP lookup.
function lookupCountry(req) {
  const cf = req.headers['cf-ipcountry'];
  if (cf && cf !== 'XX') return String(cf).toUpperCase();

  const hdr = req.headers['x-country'] || req.headers['x-vercel-ip-country'];
  if (hdr) return String(hdr).toUpperCase();

  let ip = clientIp(req);
  if (ip.startsWith('::ffff:')) ip = ip.slice(7); // unwrap IPv4-mapped IPv6
  const geo = ip ? geoip.lookup(ip) : null;
  return geo && geo.country ? geo.country.toUpperCase() : 'XX';
}

// Core cloaking decision. Returns true when the item should be VISIBLE.
//   mode "off"   -> always visible
//   mode "allow" -> visible only to listed countries
//   mode "block" -> hidden from listed countries
function isVisible(mode, countriesCsv, country) {
  if (!mode || mode === 'off') return true;
  const list = String(countriesCsv || '')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  if (list.length === 0) return true;

  if (mode === 'allow') return list.includes(country);
  if (mode === 'block') return !list.includes(country);
  return true;
}

module.exports = { clientIp, lookupCountry, isVisible };
