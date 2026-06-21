<?php
// JSON API — same routes/shapes as the Node version so the panel is reused as-is.

function pp_sanitize_cloak_extras($b) {
  $os = $b['cloak_os'] ?? '';
  return [
    'cloak_bots' => (($b['cloak_bots'] ?? '') === 'hide') ? 'hide' : 'off',
    'cloak_vpn' => (($b['cloak_vpn'] ?? '') === 'hide') ? 'hide' : 'off',
    'cloak_click_id' => (($b['cloak_click_id'] ?? '') === 'require') ? 'require' : 'off',
    'cloak_devices' => in_array($b['cloak_devices'] ?? '', ['mobile', 'desktop'], true) ? $b['cloak_devices'] : '',
    'cloak_os' => in_array($os, ['ios', 'android', 'windows', 'mac', 'linux'], true) ? $os : '',
    'cloak_ref_mode' => in_array($b['cloak_ref_mode'] ?? '', ['off', 'allow', 'block'], true) ? $b['cloak_ref_mode'] : 'off',
    'cloak_ref_list' => csv_lower($b['cloak_ref_list'] ?? ''),
    'cloak_lang_mode' => in_array($b['cloak_lang_mode'] ?? '', ['off', 'allow', 'block'], true) ? $b['cloak_lang_mode'] : 'off',
    'cloak_lang_list' => csv_lower($b['cloak_lang_list'] ?? ''),
  ];
}

function pp_slug_taken($slug, $exceptId = 0) {
  $a = db()->prepare('SELECT id FROM pages WHERE slug = ? AND id != ?'); $a->execute([$slug, $exceptId]);
  $b = db()->prepare('SELECT id FROM short_links WHERE code = ?'); $b->execute([$slug]);
  return $a->fetch() || $b->fetch();
}

function pp_api($method, $parts) {
  $p0 = $parts[0] ?? '';
  $p1 = $parts[1] ?? '';
  $p2 = $parts[2] ?? '';

  // ---- public auth routes ----
  if ($p0 === 'auth' && $p1 === 'login' && $method === 'POST') {
    $b = body_json();
    if (!pp_verify_credentials($b['username'] ?? '', $b['password'] ?? ''))
      json_out(['error' => 'Username atau password salah'], 401);
    pp_set_login_cookie(pp_issue_token($b['username']));
    json_out(['ok' => true, 'username' => $b['username']]);
  }
  if ($p0 === 'auth' && $p1 === 'logout' && $method === 'POST') {
    pp_clear_login_cookie();
    json_out(['ok' => true]);
  }

  // ---- everything below requires auth ----
  pp_require_auth();

  if ($p0 === 'auth' && $p1 === 'me') json_out(['username' => pp_current_user()]);

  // settings
  if ($p0 === 'settings' && $p1 === '' && $method === 'GET') {
    json_out([
      'site_title' => get_setting('site_title', 'page-page'),
      'admin_username' => get_setting('admin_username', 'admin'),
      'base_url' => pp_base_url(),
      'global_pixels' => json_decode(get_setting('global_pixels', '{}') ?: '{}', true) ?: new stdClass(),
      'ua_blocklist' => get_setting('ua_blocklist', ''),
    ]);
  }
  if ($p0 === 'settings' && $p1 === '' && $method === 'PUT') {
    $b = body_json();
    if (isset($b['site_title']) && is_string($b['site_title'])) set_setting('site_title', $b['site_title']);
    if (isset($b['global_pixels']) && is_array($b['global_pixels'])) set_setting('global_pixels', json_encode($b['global_pixels']));
    if (isset($b['ua_blocklist']) && is_string($b['ua_blocklist'])) set_setting('ua_blocklist', $b['ua_blocklist']);
    json_out(['ok' => true]);
  }
  if ($p0 === 'settings' && $p1 === 'password' && $method === 'POST') {
    $b = body_json();
    if (!pp_verify_credentials(get_setting('admin_username'), $b['current'] ?? ''))
      json_out(['error' => 'Password saat ini salah'], 400);
    if (strlen($b['next'] ?? '') < 6) json_out(['error' => 'Password baru minimal 6 karakter'], 400);
    pp_change_password($b['next']);
    json_out(['ok' => true]);
  }

  // upload
  if ($p0 === 'upload' && $method === 'POST') {
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) json_out(['error' => 'No file'], 400);
    $ext = preg_replace('/[^.a-z0-9]/', '', strtolower('.' . pathinfo($_FILES['file']['name'], PATHINFO_EXTENSION)));
    $name = time() . '-' . bin2hex(random_bytes(4)) . $ext;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], PP_UPLOADS_DIR . '/' . $name)) json_out(['error' => 'Upload gagal'], 500);
    json_out(['url' => 'uploads/' . $name]);
  }

  // pages
  if ($p0 === 'pages' && $p1 === '' && $method === 'GET') {
    $pages = db()->query('SELECT * FROM pages ORDER BY created_at DESC')->fetchAll();
    foreach ($pages as &$pg) {
      $c = db()->prepare('SELECT COUNT(*) n FROM buttons WHERE page_id = ?'); $c->execute([$pg['id']]);
      $pg['buttons_count'] = (int)$c->fetch()['n'];
    }
    json_out($pages);
  }
  if ($p0 === 'pages' && $p1 !== '' && $p2 === '' && $method === 'GET') {
    $st = db()->prepare('SELECT * FROM pages WHERE id = ?'); $st->execute([$p1]);
    $page = $st->fetch(); if (!$page) json_out(['error' => 'Not found'], 404);
    $bt = db()->prepare('SELECT * FROM buttons WHERE page_id = ? ORDER BY sort_order, id'); $bt->execute([$p1]);
    $page['buttons'] = $bt->fetchAll();
    json_out($page);
  }
  if ($p0 === 'pages' && $p1 === '' && $method === 'POST') {
    $b = body_json();
    $slug = $b['slug'] ?? '';
    if (!$slug || !preg_match('/^[a-zA-Z0-9_-]+$/', $slug)) json_out(['error' => 'Slug hanya boleh huruf, angka, - dan _'], 400);
    if (pp_reserved($slug)) json_out(['error' => 'Slug ini dipakai sistem'], 400);
    if (pp_slug_taken($slug)) json_out(['error' => 'Slug sudah dipakai'], 409);
    $st = db()->prepare('INSERT INTO pages (slug,title,description,avatar,theme,pixels) VALUES (?,?,?,?,?,?)');
    $st->execute([$slug, $b['title'] ?? '', $b['description'] ?? '', $b['avatar'] ?? '',
      json_encode($b['theme'] ?? new stdClass()), json_encode($b['pixels'] ?? new stdClass())]);
    json_out(['id' => (int)db()->lastInsertId()]);
  }
  if ($p0 === 'pages' && $p1 !== '' && $p2 === '' && $method === 'PUT') {
    $st = db()->prepare('SELECT * FROM pages WHERE id = ?'); $st->execute([$p1]);
    $page = $st->fetch(); if (!$page) json_out(['error' => 'Not found'], 404);
    $b = body_json();
    $slug = $b['slug'] ?? $page['slug'];
    if ($slug !== $page['slug']) {
      if (!preg_match('/^[a-zA-Z0-9_-]+$/', $slug)) json_out(['error' => 'Slug tidak valid'], 400);
      if (pp_reserved($slug)) json_out(['error' => 'Slug ini dipakai sistem'], 400);
      if (pp_slug_taken($slug, $page['id'])) json_out(['error' => 'Slug sudah dipakai'], 409);
    }
    $u = db()->prepare("UPDATE pages SET slug=?,title=?,description=?,avatar=?,theme=?,published=?,pixels=?,updated_at=datetime('now') WHERE id=?");
    $u->execute([
      $slug, $b['title'] ?? $page['title'], $b['description'] ?? $page['description'], $b['avatar'] ?? $page['avatar'],
      isset($b['theme']) ? json_encode($b['theme']) : $page['theme'],
      isset($b['published']) ? ($b['published'] ? 1 : 0) : $page['published'],
      isset($b['pixels']) ? json_encode($b['pixels']) : $page['pixels'],
      $page['id'],
    ]);
    json_out(['ok' => true]);
  }
  if ($p0 === 'pages' && $p1 !== '' && $p2 === '' && $method === 'DELETE') {
    $st = db()->prepare('DELETE FROM pages WHERE id = ?'); $st->execute([$p1]);
    json_out(['ok' => true]);
  }

  // buttons: create under a page
  if ($p0 === 'pages' && $p1 !== '' && $p2 === 'buttons' && $method === 'POST') {
    $chk = db()->prepare('SELECT id FROM pages WHERE id = ?'); $chk->execute([$p1]);
    if (!$chk->fetch()) json_out(['error' => 'Page not found'], 404);
    $b = body_json();
    $max = db()->prepare('SELECT COALESCE(MAX(sort_order),-1) m FROM buttons WHERE page_id = ?'); $max->execute([$p1]);
    $ex = pp_sanitize_cloak_extras($b);
    $params = array_merge([
      'page_id' => $p1, 'label' => $b['label'] ?? '', 'url' => $b['url'] ?? '', 'icon' => $b['icon'] ?? '',
      'bg_color' => $b['bg_color'] ?? '#111827', 'text_color' => $b['text_color'] ?? '#ffffff',
      'style' => in_array($b['style'] ?? '', ['filled', 'outline', 'soft', 'pill'], true) ? $b['style'] : 'filled',
      'sort_order' => (int)$max->fetch()['m'] + 1,
      'enabled' => (($b['enabled'] ?? true) === false || ($b['enabled'] ?? 1) === 0) ? 0 : 1,
      'cloak_mode' => in_array($b['cloak_mode'] ?? '', ['off', 'allow', 'block'], true) ? $b['cloak_mode'] : 'off',
      'cloak_countries' => csv_upper($b['cloak_countries'] ?? ''),
      'start_at' => $b['start_at'] ?? '', 'end_at' => $b['end_at'] ?? '',
    ], $ex);
    $st = db()->prepare('INSERT INTO buttons (page_id,label,url,icon,bg_color,text_color,style,sort_order,enabled,cloak_mode,cloak_countries,start_at,end_at,cloak_bots,cloak_devices,cloak_ref_mode,cloak_ref_list,cloak_vpn,cloak_click_id,cloak_os,cloak_lang_mode,cloak_lang_list)
      VALUES (:page_id,:label,:url,:icon,:bg_color,:text_color,:style,:sort_order,:enabled,:cloak_mode,:cloak_countries,:start_at,:end_at,:cloak_bots,:cloak_devices,:cloak_ref_mode,:cloak_ref_list,:cloak_vpn,:cloak_click_id,:cloak_os,:cloak_lang_mode,:cloak_lang_list)');
    $st->execute($params);
    json_out(['id' => (int)db()->lastInsertId()]);
  }
  // buttons reorder
  if ($p0 === 'buttons' && $p1 === 'reorder' && $method === 'POST') {
    $order = body_json()['order'] ?? [];
    $st = db()->prepare('UPDATE buttons SET sort_order = ? WHERE id = ?');
    db()->beginTransaction();
    foreach ($order as $i => $id) $st->execute([$i, $id]);
    db()->commit();
    json_out(['ok' => true]);
  }
  // buttons update/delete
  if ($p0 === 'buttons' && $p1 !== '' && $p1 !== 'reorder' && $method === 'PUT') {
    $st = db()->prepare('SELECT * FROM buttons WHERE id = ?'); $st->execute([$p1]);
    $btn = $st->fetch(); if (!$btn) json_out(['error' => 'Not found'], 404);
    $b = array_merge($btn, body_json());
    $ex = pp_sanitize_cloak_extras($b);
    $params = array_merge([
      'label' => $b['label'] ?? '', 'url' => $b['url'] ?? '', 'icon' => $b['icon'] ?? '',
      'bg_color' => $b['bg_color'] ?? '#111827', 'text_color' => $b['text_color'] ?? '#ffffff',
      'style' => in_array($b['style'] ?? '', ['filled', 'outline', 'soft', 'pill'], true) ? $b['style'] : 'filled',
      'enabled' => (($b['enabled'] ?? true) === false || ($b['enabled'] ?? 1) === 0) ? 0 : 1,
      'cloak_mode' => in_array($b['cloak_mode'] ?? '', ['off', 'allow', 'block'], true) ? $b['cloak_mode'] : 'off',
      'cloak_countries' => csv_upper($b['cloak_countries'] ?? ''),
      'start_at' => $b['start_at'] ?? '', 'end_at' => $b['end_at'] ?? '', 'id' => $btn['id'],
    ], $ex);
    $u = db()->prepare('UPDATE buttons SET label=:label,url=:url,icon=:icon,bg_color=:bg_color,text_color=:text_color,style=:style,enabled=:enabled,cloak_mode=:cloak_mode,cloak_countries=:cloak_countries,start_at=:start_at,end_at=:end_at,cloak_bots=:cloak_bots,cloak_devices=:cloak_devices,cloak_ref_mode=:cloak_ref_mode,cloak_ref_list=:cloak_ref_list,cloak_vpn=:cloak_vpn,cloak_click_id=:cloak_click_id,cloak_os=:cloak_os,cloak_lang_mode=:cloak_lang_mode,cloak_lang_list=:cloak_lang_list WHERE id=:id');
    $u->execute($params);
    json_out(['ok' => true]);
  }
  if ($p0 === 'buttons' && $p1 !== '' && $p1 !== 'reorder' && $method === 'DELETE') {
    $st = db()->prepare('DELETE FROM buttons WHERE id = ?'); $st->execute([$p1]);
    json_out(['ok' => true]);
  }

  // short links
  if ($p0 === 'links' && $p1 === '' && $method === 'GET') {
    json_out(db()->query('SELECT * FROM short_links ORDER BY created_at DESC')->fetchAll());
  }
  if ($p0 === 'links' && $p1 === '' && $method === 'POST') {
    $b = body_json();
    $target = $b['target_url'] ?? '';
    if (!preg_match('#^https?://#i', $target)) json_out(['error' => 'Target URL harus diawali http:// atau https://'], 400);
    $code = trim($b['code'] ?? '') ?: substr(bin2hex(random_bytes(5)), 0, 6);
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $code)) json_out(['error' => 'Kode tidak valid'], 400);
    if (pp_reserved($code)) json_out(['error' => 'Kode ini dipakai sistem'], 400);
    if (pp_slug_taken($code)) json_out(['error' => 'Kode sudah dipakai'], 409);
    $ex = pp_sanitize_cloak_extras($b);
    $st = db()->prepare('INSERT INTO short_links (code,target_url,title,cloak_mode,cloak_countries,cloak_fallback,cloak_bots,cloak_devices,cloak_ref_mode,cloak_ref_list,cloak_vpn,cloak_click_id,cloak_os,cloak_lang_mode,cloak_lang_list,cloak_js_challenge)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $st->execute([$code, $target, $b['title'] ?? '',
      in_array($b['cloak_mode'] ?? '', ['off', 'allow', 'block'], true) ? $b['cloak_mode'] : 'off',
      csv_upper($b['cloak_countries'] ?? ''), $b['cloak_fallback'] ?? '',
      $ex['cloak_bots'], $ex['cloak_devices'], $ex['cloak_ref_mode'], $ex['cloak_ref_list'],
      $ex['cloak_vpn'], $ex['cloak_click_id'], $ex['cloak_os'], $ex['cloak_lang_mode'], $ex['cloak_lang_list'],
      !empty($b['cloak_js_challenge']) ? 1 : 0]);
    json_out(['id' => (int)db()->lastInsertId(), 'code' => $code, 'short_url' => pp_base_url() . '/' . $code]);
  }
  if ($p0 === 'links' && $p1 !== '' && $method === 'PUT') {
    $st = db()->prepare('SELECT * FROM short_links WHERE id = ?'); $st->execute([$p1]);
    $link = $st->fetch(); if (!$link) json_out(['error' => 'Not found'], 404);
    $b = body_json();
    if (isset($b['target_url']) && !preg_match('#^https?://#i', $b['target_url'])) json_out(['error' => 'Target URL tidak valid'], 400);
    $ex = pp_sanitize_cloak_extras(array_merge($link, $b));
    $u = db()->prepare('UPDATE short_links SET target_url=?,title=?,enabled=?,cloak_mode=?,cloak_countries=?,cloak_fallback=?,cloak_bots=?,cloak_devices=?,cloak_ref_mode=?,cloak_ref_list=?,cloak_vpn=?,cloak_click_id=?,cloak_os=?,cloak_lang_mode=?,cloak_lang_list=?,cloak_js_challenge=? WHERE id=?');
    $u->execute([
      $b['target_url'] ?? $link['target_url'], $b['title'] ?? $link['title'],
      isset($b['enabled']) ? ($b['enabled'] ? 1 : 0) : $link['enabled'],
      isset($b['cloak_mode']) && in_array($b['cloak_mode'], ['off', 'allow', 'block'], true) ? $b['cloak_mode'] : $link['cloak_mode'],
      isset($b['cloak_countries']) ? csv_upper($b['cloak_countries']) : $link['cloak_countries'],
      $b['cloak_fallback'] ?? $link['cloak_fallback'],
      $ex['cloak_bots'], $ex['cloak_devices'], $ex['cloak_ref_mode'], $ex['cloak_ref_list'],
      $ex['cloak_vpn'], $ex['cloak_click_id'], $ex['cloak_os'], $ex['cloak_lang_mode'], $ex['cloak_lang_list'],
      isset($b['cloak_js_challenge']) ? ($b['cloak_js_challenge'] ? 1 : 0) : $link['cloak_js_challenge'],
      $link['id'],
    ]);
    json_out(['ok' => true]);
  }
  if ($p0 === 'links' && $p1 !== '' && $method === 'DELETE') {
    $st = db()->prepare('DELETE FROM short_links WHERE id = ?'); $st->execute([$p1]);
    json_out(['ok' => true]);
  }

  // stats
  if ($p0 === 'stats' && $method === 'GET') {
    $n = fn($sql) => (int)db()->query($sql)->fetch()['n'];
    json_out([
      'pages' => $n('SELECT COUNT(*) n FROM pages'),
      'buttons' => $n('SELECT COUNT(*) n FROM buttons'),
      'links' => $n('SELECT COUNT(*) n FROM short_links'),
      'page_views' => $n('SELECT COALESCE(SUM(views),0) n FROM pages'),
      'button_clicks' => $n('SELECT COALESCE(SUM(clicks),0) n FROM buttons'),
      'link_clicks' => $n('SELECT COALESCE(SUM(clicks),0) n FROM short_links'),
    ]);
  }

  // analytics
  if ($p0 === 'analytics' && $method === 'GET') {
    $days = max(1, min(365, (int)($_GET['days'] ?? 30)));
    $since = "-$days days";
    $q = function ($sql, $args = []) { $st = db()->prepare($sql); $st->execute($args); return $st->fetchAll(); };
    $byCountry = $q("SELECT country, COUNT(*) n FROM events WHERE type IN ('button_click','short_click','page_view') AND created_at >= datetime('now', ?) GROUP BY country ORDER BY n DESC LIMIT 20", [$since]);
    $byType = $q("SELECT type, COUNT(*) n FROM events WHERE created_at >= datetime('now', ?) GROUP BY type", [$since]);
    $daily = $q("SELECT date(created_at) day, SUM(type='page_view') views, SUM(type IN ('button_click','short_click')) clicks FROM events WHERE created_at >= datetime('now', ?) GROUP BY day ORDER BY day", [$since]);
    $blocked = (int)($q("SELECT COUNT(*) n FROM events WHERE type='short_blocked' AND created_at >= datetime('now', ?)", [$since])[0]['n'] ?? 0);
    $split = $q("SELECT is_bot, COUNT(*) n FROM events WHERE created_at >= datetime('now', ?) GROUP BY is_bot", [$since]);
    $humans = 0; $bots = 0;
    foreach ($split as $s) { if ((int)$s['is_bot'] === 0) $humans = (int)$s['n']; else $bots = (int)$s['n']; }
    $dc = (int)($q("SELECT COUNT(*) n FROM events WHERE is_dc=1 AND created_at >= datetime('now', ?)", [$since])[0]['n'] ?? 0);
    $topBotIps = $q("SELECT ip, country, COUNT(*) n FROM events WHERE is_bot=1 AND ip!='' AND created_at >= datetime('now', ?) GROUP BY ip ORDER BY n DESC LIMIT 12", [$since]);
    $recentBots = $q("SELECT type, ip, country, ua, created_at FROM events WHERE is_bot=1 AND created_at >= datetime('now', ?) ORDER BY id DESC LIMIT 15", [$since]);
    // Traffic source: accepted (passed cloaking) vs blocked (cloaked away).
    $bySource = $q("SELECT source,
        SUM(type IN ('page_view','button_click','short_click')) accepted,
        SUM(type IN ('page_blocked','short_blocked')) blocked
      FROM events WHERE created_at >= datetime('now', ?)
      GROUP BY source ORDER BY (accepted + blocked) DESC LIMIT 20", [$since]);
    json_out([
      'days' => $days, 'byCountry' => $byCountry, 'byType' => $byType, 'daily' => $daily, 'blocked' => $blocked,
      'topPages' => $q('SELECT slug,title,views FROM pages ORDER BY views DESC LIMIT 5'),
      'topLinks' => $q('SELECT code,title,clicks FROM short_links ORDER BY clicks DESC LIMIT 5'),
      'topButtons' => $q('SELECT label,clicks FROM buttons ORDER BY clicks DESC LIMIT 5'),
      'humans' => $humans, 'bots' => $bots, 'datacenter' => $dc, 'topBotIps' => $topBotIps, 'recentBots' => $recentBots,
      'bySource' => $bySource,
    ]);
  }

  // bot / datacenter IP lists
  foreach ([['botips', 'bot_ips'], ['dcips', 'dc_ips']] as $pair) {
    [$route, $table] = $pair;
    if ($p0 === $route && $p1 === '' && $method === 'GET') json_out(db()->query("SELECT * FROM $table ORDER BY created_at DESC")->fetchAll());
    if ($p0 === $route && $p1 === '' && $method === 'POST') {
      $b = body_json(); $cidr = trim($b['cidr'] ?? ''); $note = trim($b['note'] ?? '');
      if (!preg_match('#^(\d{1,3}\.){3}\d{1,3}(/\d{1,2})?$#', $cidr)) json_out(['error' => 'Format harus IPv4 atau CIDR, mis. 1.2.3.4 atau 1.2.3.0/24'], 400);
      try { $st = db()->prepare("INSERT INTO $table (cidr,note) VALUES (?,?)"); $st->execute([$cidr, $note]); json_out(['id' => (int)db()->lastInsertId()]); }
      catch (Throwable $e) { json_out(['error' => 'IP/CIDR sudah ada di daftar'], 409); }
    }
    if ($p0 === $route && $p1 !== '' && $method === 'DELETE') { $st = db()->prepare("DELETE FROM $table WHERE id = ?"); $st->execute([$p1]); json_out(['ok' => true]); }
  }

  // cloaking tester — simulate a visitor and see each item's visibility + reason
  if ($p0 === 'cloak' && $p1 === 'test' && $method === 'POST') {
    $b = body_json();
    $ctx = [
      'country' => strtoupper(trim($b['country'] ?? 'ID')) ?: 'XX',
      'referrer' => strtolower(trim($b['referrer'] ?? '')),
      'device' => in_array($b['device'] ?? '', ['mobile', 'desktop'], true) ? $b['device'] : 'mobile',
      'os' => in_array($b['os'] ?? '', ['ios', 'android', 'windows', 'mac', 'linux'], true) ? $b['os'] : '',
      'lang' => strtolower(trim($b['lang'] ?? '')),
      'clickId' => !empty($b['clickId']),
      'isBot' => !empty($b['isBot']),
      'isDatacenter' => !empty($b['isDatacenter']),
    ];
    $buttons = [];
    foreach (db()->query('SELECT b.*, p.slug AS page_slug FROM buttons b JOIN pages p ON p.id=b.page_id ORDER BY b.page_id, b.sort_order, b.id')->fetchAll() as $bt) {
      $ev = pp_evaluate($bt, $ctx, true);
      $buttons[] = ['id' => $bt['id'], 'label' => $bt['label'], 'page_slug' => $bt['page_slug'], 'visible' => $ev['visible'], 'reason' => $ev['reason']];
    }
    $links = [];
    foreach (db()->query('SELECT * FROM short_links ORDER BY id')->fetchAll() as $ln) {
      $ev = pp_evaluate($ln, $ctx, false);
      $links[] = ['id' => $ln['id'], 'code' => $ln['code'], 'visible' => $ev['visible'], 'reason' => $ev['reason']];
    }
    json_out(['ctx' => $ctx, 'buttons' => $buttons, 'links' => $links]);
  }

  // backup
  if ($p0 === 'backup' && $p1 === 'export' && $method === 'GET') {
    $bytes = pp_export_zip();
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="page-page-backup-' . gmdate('Ymd-His') . '.zip"');
    echo $bytes; exit;
  }
  if ($p0 === 'backup' && $p1 === 'import' && $method === 'POST') {
    if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) json_out(['error' => 'Pilih file backup .zip'], 400);
    try { $res = pp_import_zip($_FILES['file']['tmp_name']); json_out(['ok' => true, 'restored' => $res]); }
    catch (Throwable $e) { json_out(['error' => $e->getMessage()], 400); }
  }

  json_out(['error' => 'Not found'], 404);
}
