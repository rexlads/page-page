'use strict';

const { clientIp } = require('./geo');

// Known crawler / automation / ad-reviewer user agents.
const BOT_UA = new RegExp(
  [
    'bot', 'crawl', 'spider', 'slurp', 'mediapartners',
    'facebookexternalhit', 'facebot', 'meta-external', 'instagram',
    'tiktok', 'bytespider', 'bytedance',
    'telegrambot', 'whatsapp', 'discordbot', 'skypeuripreview', 'vkshare',
    'redditbot', 'linkedinbot', 'pinterest', 'embedly', 'quora link preview',
    'twitterbot', 'applebot', 'amazonbot',
    'googlebot', 'google-read', 'adsbot', 'apis-google', 'feedfetcher',
    'bingbot', 'bingpreview', 'duckduckbot', 'yandex', 'baidu', 'sogou', 'petalbot',
    'semrush', 'ahrefs', 'mj12', 'dotbot', 'dataforseo', 'gptbot', 'ccbot',
    'claudebot', 'anthropic', 'perplexity', 'oai-searchbot',
    'headless', 'phantom', 'puppeteer', 'playwright', 'selenium',
    'curl', 'wget', 'python-requests', 'python-urllib', 'go-http', 'java/',
    'okhttp', 'axios', 'node-fetch', 'httpclient', 'scrapy', 'libwww',
  ].join('|'),
  'i'
);

function isBotUA(ua = '') {
  return BOT_UA.test(ua);
}

// --- IPv4 CIDR matching -----------------------------------------------------
function ipv4ToLong(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = (n << 8) + o;
  }
  return n >>> 0;
}

function cidrMatch(ip, cidr) {
  if (!cidr.includes('/')) return ip === cidr; // exact match (any family)
  const [range, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const ipL = ipv4ToLong(ip);
  const rangeL = ipv4ToLong(range);
  if (ipL == null || rangeL == null || !Number.isInteger(bits)) return false;
  if (bits <= 0) return true;
  if (bits > 32) return false;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipL & mask) === (rangeL & mask);
}

function ipInList(ip, list) {
  if (!ip || !Array.isArray(list)) return false;
  let v4 = ip;
  if (v4.startsWith('::ffff:')) v4 = v4.slice(7);
  return list.some((c) => cidrMatch(v4, c));
}

// mobile (incl. tablet) vs desktop
function deviceType(ua = '') {
  if (/mobile|android|iphone|ipod|ipad|tablet|blackberry|iemobile|opera mini|silk/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

// Decide whether a request looks like a bot, and why.
function detectBot(req, ipList = []) {
  const ua = req.headers['user-agent'] || '';
  if (!ua) return { isBot: true, reason: 'no-ua' };
  if (isBotUA(ua)) return { isBot: true, reason: 'ua' };
  if (ipInList(clientIp(req), ipList)) return { isBot: true, reason: 'ip' };
  return { isBot: false, reason: '' };
}

module.exports = { isBotUA, cidrMatch, ipInList, deviceType, detectBot };
