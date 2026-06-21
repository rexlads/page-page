<?php
// Visitor IP + country resolution. Behind Cloudflare this is exact (CF-IPCountry).

function pp_client_ip() {
  $h = $_SERVER;
  if (!empty($h['HTTP_CF_CONNECTING_IP'])) return trim($h['HTTP_CF_CONNECTING_IP']);
  if (!empty($h['HTTP_X_FORWARDED_FOR'])) return trim(explode(',', $h['HTTP_X_FORWARDED_FOR'])[0]);
  if (!empty($h['HTTP_X_REAL_IP'])) return trim($h['HTTP_X_REAL_IP']);
  $ip = $h['REMOTE_ADDR'] ?? '';
  if (strpos($ip, '::ffff:') === 0) $ip = substr($ip, 7);
  return $ip;
}

function pp_country() {
  if (!empty($_SERVER['HTTP_CF_IPCOUNTRY'])) return strtoupper($_SERVER['HTTP_CF_IPCOUNTRY']);
  if (!empty($_SERVER['HTTP_X_COUNTRY'])) return strtoupper($_SERVER['HTTP_X_COUNTRY']);
  if (!empty($_SERVER['HTTP_X_VERCEL_IP_COUNTRY'])) return strtoupper($_SERVER['HTTP_X_VERCEL_IP_COUNTRY']);
  return 'XX';
}

// true = visible
function pp_is_visible($mode, $countries_csv, $country) {
  if (!$mode || $mode === 'off') return true;
  $list = [];
  foreach (explode(',', (string)$countries_csv) as $c) {
    $c = strtoupper(trim($c));
    if ($c !== '') $list[] = $c;
  }
  if (!$list) return true;
  if ($mode === 'allow') return in_array($country, $list, true);
  if ($mode === 'block') return !in_array($country, $list, true);
  return true;
}

function pp_scheduled_now($start, $end) {
  $now = time();
  if ($start) { $s = strtotime($start); if ($s !== false && $s > $now) return false; }
  if ($end)   { $en = strtotime($end);  if ($en !== false && $en < $now) return false; }
  return true;
}
