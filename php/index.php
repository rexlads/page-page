<?php
// Front controller. Under Apache, real files (panel/, uploads/) are served
// directly via .htaccess; everything else lands here.

// Built-in PHP server: let it serve existing static files itself.
if (php_sapi_name() === 'cli-server') {
  $f = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
  if (is_file($f)) return false;
}

require __DIR__ . '/lib/util.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/geo.php';
require __DIR__ . '/lib/bots.php';
require __DIR__ . '/lib/cloak.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/render.php';
require __DIR__ . '/lib/backup.php';
require __DIR__ . '/lib/api.php';

$path = pp_path();
$method = pp_method();

if ($path === '/health') json_out(['ok' => true]);

if ($path === '/api' || strpos($path, '/api/') === 0) {
  $rest = trim(substr($path, 4), '/');
  $parts = $rest === '' ? [] : explode('/', $rest);
  // pad so handlers can read $parts[0..2] safely
  $parts = array_pad($parts, 3, '');
  pp_api($method, $parts);
}

if ($path === '/') { header('Location: panel/'); exit; }

// Button click tracker + redirect.
if (preg_match('#^/r/b/(\d+)$#', $path, $m)) {
  $ctx = pp_context();
  $st = db()->prepare('SELECT * FROM buttons WHERE id = ?'); $st->execute([$m[1]]);
  $btn = $st->fetch();
  if (!$btn || !$btn['url']) { http_response_code(404); exit('Link tidak ditemukan'); }
  if (!pp_button_visible($btn, $ctx)) { http_response_code(404); exit('Link tidak tersedia saat ini'); }
  if (!$ctx['isBot']) db()->prepare('UPDATE buttons SET clicks = clicks + 1 WHERE id = ?')->execute([$btn['id']]);
  pp_log_event('button_click', $btn['id'], $ctx);
  header('Location: ' . $btn['url'], true, 302); exit;
}

// Unified resolver: biolink page OR short link.
$handle = ltrim($path, '/');
if ($handle === '' || pp_reserved($handle) || strpos($handle, '/') !== false) { http_response_code(404); exit('404 Not Found'); }

$ctx = pp_context();

$st = db()->prepare('SELECT * FROM pages WHERE slug = ? AND published = 1'); $st->execute([$handle]);
$page = $st->fetch();
if ($page) {
  $bt = db()->prepare('SELECT * FROM buttons WHERE page_id = ? ORDER BY sort_order, id'); $bt->execute([$page['id']]);
  $visible = array_values(array_filter($bt->fetchAll(), fn($b) => pp_button_visible($b, $ctx)));
  if (!$ctx['isBot']) db()->prepare('UPDATE pages SET views = views + 1 WHERE id = ?')->execute([$page['id']]);
  pp_log_event('page_view', $page['id'], $ctx);
  header('Cache-Control: no-store');
  echo pp_render_page($page, $visible); exit;
}

$st = db()->prepare('SELECT * FROM short_links WHERE code = ? AND enabled = 1'); $st->execute([$handle]);
$link = $st->fetch();
if ($link) {
  if (!pp_passes($link, $ctx)) {
    pp_log_event('short_blocked', $link['id'], $ctx);
    if ($link['cloak_fallback']) { header('Location: ' . $link['cloak_fallback'], true, 302); exit; }
    http_response_code(404); exit('Link tidak tersedia di wilayah Anda');
  }
  if (!$ctx['isBot']) db()->prepare('UPDATE short_links SET clicks = clicks + 1 WHERE id = ?')->execute([$link['id']]);
  pp_log_event('short_click', $link['id'], $ctx);
  if ($link['cloak_js_challenge']) { header('Cache-Control: no-store'); echo pp_js_challenge($link['target_url']); exit; }
  header('Location: ' . $link['target_url'], true, 302); exit;
}

http_response_code(404);
exit('404 Not Found');
