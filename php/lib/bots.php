<?php
// Bot / device / OS / language / click-id detection. Pure PHP, no deps.

function pp_bot_ua_regex() {
  static $re = null;
  if ($re === null) {
    $parts = [
      'bot','crawl','spider','slurp','mediapartners','facebookexternalhit','facebot','meta-external',
      'instagram','tiktok','bytespider','bytedance','telegrambot','whatsapp','discordbot',
      'skypeuripreview','vkshare','redditbot','linkedinbot','pinterest','embedly','quora link preview',
      'twitterbot','applebot','amazonbot','googlebot','google-read','adsbot','apis-google','feedfetcher',
      'bingbot','bingpreview','duckduckbot','yandex','baidu','sogou','petalbot','semrush','ahrefs','mj12',
      'dotbot','dataforseo','gptbot','ccbot','claudebot','anthropic','perplexity','oai-searchbot',
      'headless','phantom','puppeteer','playwright','selenium','curl','wget','python-requests',
      'python-urllib','go-http','java/','okhttp','axios','node-fetch','httpclient','scrapy','libwww',
    ];
    $re = '/' . implode('|', array_map(function ($p) { return preg_quote($p, '/'); }, $parts)) . '/i';
  }
  return $re;
}

function pp_is_bot_ua($ua) { return $ua !== '' && preg_match(pp_bot_ua_regex(), $ua) === 1; }

function pp_ipv4_to_long($ip) {
  $l = ip2long($ip);
  return $l === false ? null : ($l & 0xFFFFFFFF);
}
function pp_cidr_match($ip, $cidr) {
  if (strpos($cidr, '/') === false) return $ip === $cidr;
  [$range, $bits] = explode('/', $cidr, 2);
  $bits = (int)$bits;
  $ipL = pp_ipv4_to_long($ip); $rL = pp_ipv4_to_long($range);
  if ($ipL === null || $rL === null) return false;
  if ($bits <= 0) return true;
  if ($bits > 32) return false;
  $mask = $bits === 32 ? 0xFFFFFFFF : (~((1 << (32 - $bits)) - 1) & 0xFFFFFFFF);
  return ($ipL & $mask) === ($rL & $mask);
}
function pp_ip_in_list($ip, $list) {
  if (!$ip || !$list) return false;
  if (strpos($ip, '::ffff:') === 0) $ip = substr($ip, 7);
  foreach ($list as $c) if (pp_cidr_match($ip, $c)) return true;
  return false;
}

function pp_device_type($ua) {
  return preg_match('/mobile|android|iphone|ipod|ipad|tablet|blackberry|iemobile|opera mini|silk/i', $ua) ? 'mobile' : 'desktop';
}
function pp_os_type($ua) {
  if (preg_match('/iphone|ipad|ipod|ios/i', $ua)) return 'ios';
  if (preg_match('/android/i', $ua)) return 'android';
  if (preg_match('/windows/i', $ua)) return 'windows';
  if (preg_match('/mac os x|macintosh/i', $ua)) return 'mac';
  if (preg_match('/linux|x11|ubuntu/i', $ua)) return 'linux';
  return '';
}

const PP_CLICK_IDS = ['fbclid','ttclid','gclid','gbraid','wbraid','msclkid','twclid','li_fat_id','epik','sccid','igshid','dclid'];
function pp_has_click_id() {
  foreach (PP_CLICK_IDS as $k) if (isset($_GET[$k]) && $_GET[$k] !== '') return true;
  return false;
}

function pp_primary_lang() {
  $al = $_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '';
  $first = strtolower(substr(trim(explode(',', $al)[0]), 0, 2));
  return preg_match('/^[a-z]{2}$/', $first) ? $first : '';
}

// Returns ['isBot'=>bool, 'reason'=>string]. Adds a header-anomaly heuristic
// on top of UA, custom-UA, and IP-list checks (improved detection).
function pp_detect_bot($ipList, $extraUa) {
  $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
  if ($ua === '') return ['isBot' => true, 'reason' => 'no-ua'];
  if (pp_is_bot_ua($ua)) return ['isBot' => true, 'reason' => 'ua'];
  if ($extraUa) {
    $low = strtolower($ua);
    foreach ($extraUa as $s) if ($s !== '' && strpos($low, $s) !== false) return ['isBot' => true, 'reason' => 'ua-custom'];
  }
  if (pp_ip_in_list(pp_client_ip(), $ipList)) return ['isBot' => true, 'reason' => 'ip'];
  // Header anomaly: real browsers send Accept and Accept-Language; many scrapers don't.
  $hasAccept = !empty($_SERVER['HTTP_ACCEPT']);
  $hasLang = !empty($_SERVER['HTTP_ACCEPT_LANGUAGE']);
  if (!$hasAccept && !$hasLang) return ['isBot' => true, 'reason' => 'headers'];
  return ['isBot' => false, 'reason' => ''];
}
