<?php
// Central visitor context + the AND-combined cloaking rule evaluator.

function pp_bot_cidrs() {
  static $c = null;
  if ($c === null) $c = array_column(db()->query('SELECT cidr FROM bot_ips')->fetchAll(), 'cidr');
  return $c;
}
function pp_dc_cidrs() {
  static $c = null;
  if ($c === null) $c = array_column(db()->query('SELECT cidr FROM dc_ips')->fetchAll(), 'cidr');
  return $c;
}
function pp_ua_blocklist() {
  static $c = null;
  if ($c === null) {
    $raw = get_setting('ua_blocklist', '') ?: '';
    $c = array_values(array_filter(array_map(fn($s) => strtolower(trim($s)), explode(',', $raw))));
  }
  return $c;
}

function pp_context() {
  static $ctx = null;
  if ($ctx !== null) return $ctx;
  $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
  $det = pp_detect_bot(pp_bot_cidrs(), pp_ua_blocklist());
  $ip = pp_client_ip();
  $country = pp_country();
  // Cloudflare reports Tor exits as country "T1" — treat as datacenter/anonymizer.
  $isDc = pp_ip_in_list($ip, pp_dc_cidrs()) || $country === 'T1';
  $referrer = strtolower($_SERVER['HTTP_REFERER'] ?? '');
  $source = pp_referrer_source($referrer);
  if ($source === '') $source = pp_click_source();
  if ($source === '') $source = 'direct';
  $ctx = [
    'ua' => $ua,
    'ip' => $ip,
    'country' => $country,
    'isBot' => $det['isBot'],
    'botReason' => $det['reason'],
    'isDatacenter' => $isDc,
    'device' => pp_device_type($ua),
    'os' => pp_os_type($ua),
    'lang' => pp_primary_lang(),
    'clickId' => pp_has_click_id(),
    'referrer' => $referrer,
    'source' => $source,
  ];
  return $ctx;
}

function pp_csv($s) {
  $out = [];
  foreach (explode(',', (string)$s) as $x) { $x = strtolower(trim($x)); if ($x !== '') $out[] = $x; }
  return $out;
}

// true = item should be VISIBLE to this visitor (all active rules pass).
function pp_passes($it, $ctx) {
  if (!pp_is_visible($it['cloak_mode'] ?? 'off', $it['cloak_countries'] ?? '', $ctx['country'])) return false;
  if (($it['cloak_bots'] ?? 'off') === 'hide' && $ctx['isBot']) return false;
  if (($it['cloak_vpn'] ?? 'off') === 'hide' && $ctx['isDatacenter']) return false;
  if (($it['cloak_click_id'] ?? 'off') === 'require' && !$ctx['clickId']) return false;
  if (!empty($it['cloak_devices']) && $it['cloak_devices'] !== $ctx['device']) return false;
  if (!empty($it['cloak_os']) && $it['cloak_os'] !== $ctx['os']) return false;

  $lm = $it['cloak_lang_mode'] ?? 'off';
  if ($lm && $lm !== 'off') {
    $list = pp_csv($it['cloak_lang_list'] ?? '');
    if ($list) {
      $match = in_array($ctx['lang'], $list, true);
      if ($lm === 'allow' && !$match) return false;
      if ($lm === 'block' && $match) return false;
    }
  }

  $rm = $it['cloak_ref_mode'] ?? 'off';
  if ($rm && $rm !== 'off') {
    $list = pp_csv($it['cloak_ref_list'] ?? '');
    if ($list) {
      $match = false;
      foreach ($list as $d) if (strpos($ctx['referrer'], $d) !== false) { $match = true; break; }
      if ($rm === 'allow' && !$match) return false;
      if ($rm === 'block' && $match) return false;
    }
  }
  return true;
}

function pp_button_visible($b, $ctx) {
  return !empty($b['enabled']) && pp_passes($b, $ctx) && pp_scheduled_now($b['start_at'] ?? '', $b['end_at'] ?? '');
}

// Like pp_passes but reports the FIRST rule that hides the item (for the tester).
function pp_evaluate($it, $ctx, $isButton = false) {
  if ($isButton && empty($it['enabled'])) return ['visible' => false, 'reason' => 'tombol nonaktif'];
  if (!pp_is_visible($it['cloak_mode'] ?? 'off', $it['cloak_countries'] ?? '', $ctx['country'])) return ['visible' => false, 'reason' => 'negara'];
  if (($it['cloak_bots'] ?? 'off') === 'hide' && $ctx['isBot']) return ['visible' => false, 'reason' => 'bot'];
  if (($it['cloak_vpn'] ?? 'off') === 'hide' && $ctx['isDatacenter']) return ['visible' => false, 'reason' => 'VPN/datacenter'];
  if (($it['cloak_click_id'] ?? 'off') === 'require' && !$ctx['clickId']) return ['visible' => false, 'reason' => 'tanpa click-id iklan'];
  if (!empty($it['cloak_devices']) && $it['cloak_devices'] !== $ctx['device']) return ['visible' => false, 'reason' => 'perangkat'];
  if (!empty($it['cloak_os']) && $it['cloak_os'] !== $ctx['os']) return ['visible' => false, 'reason' => 'OS'];
  $lm = $it['cloak_lang_mode'] ?? 'off';
  if ($lm && $lm !== 'off') {
    $list = pp_csv($it['cloak_lang_list'] ?? '');
    if ($list) {
      $m = in_array($ctx['lang'], $list, true);
      if (($lm === 'allow' && !$m) || ($lm === 'block' && $m)) return ['visible' => false, 'reason' => 'bahasa'];
    }
  }
  $rm = $it['cloak_ref_mode'] ?? 'off';
  if ($rm && $rm !== 'off') {
    $list = pp_csv($it['cloak_ref_list'] ?? '');
    if ($list) {
      $m = false;
      foreach ($list as $d) if (strpos($ctx['referrer'], $d) !== false) { $m = true; break; }
      if (($rm === 'allow' && !$m) || ($rm === 'block' && $m)) return ['visible' => false, 'reason' => 'referrer'];
    }
  }
  if ($isButton && !pp_scheduled_now($it['start_at'] ?? '', $it['end_at'] ?? '')) return ['visible' => false, 'reason' => 'jadwal'];
  return ['visible' => true, 'reason' => ''];
}
