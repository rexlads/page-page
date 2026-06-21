<?php
// Front controller. Under Apache, real files (panel/, uploads/) are served
// directly via .htaccess; everything else lands here.

// Built-in PHP server: let it serve existing static files itself.
if (php_sapi_name() === 'cli-server') {
  $f = __DIR__ . parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
  if (is_file($f)) return false;
}

require __DIR__ . '/lib/util.php';

$path = pp_path();
$method = pp_method();
$isApi = ($path === '/api' || strpos($path, '/api/') === 0);

// Surface real errors (instead of a blank 500 / generic toast) as JSON for the
// panel, and convert fatals from the bootstrap into readable messages too.
ini_set('display_errors', '0');
set_exception_handler(function ($e) use ($isApi) {
  $msg = $e->getMessage();
  if ($isApi) { json_out(['error' => 'Server error: ' . $msg], 500); }
  http_response_code(500);
  exit('Server error: ' . htmlspecialchars($msg, ENT_QUOTES));
});
register_shutdown_function(function () use ($isApi) {
  $err = error_get_last();
  if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
    if (!headers_sent()) {
      http_response_code(500);
      if ($isApi) header('Content-Type: application/json; charset=utf-8');
    }
    echo $isApi ? json_encode(['error' => 'Server error: ' . $err['message']]) : ('Server error: ' . $err['message']);
  }
});

// Lightweight diagnostics — works even if the database can't open.
if ($path === '/health') {
  $dataDir = __DIR__ . '/data';
  json_out([
    'ok' => true,
    'php' => PHP_VERSION,
    'pdo_sqlite' => extension_loaded('pdo_sqlite'),
    'sqlite3' => extension_loaded('sqlite3'),
    'zip' => extension_loaded('zip'),
    'mbstring' => extension_loaded('mbstring'),
    'data_writable' => is_dir($dataDir) ? is_writable($dataDir) : is_writable(__DIR__),
  ]);
}

require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/geo.php';
require __DIR__ . '/lib/bots.php';
require __DIR__ . '/lib/cloak.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/render.php';
require __DIR__ . '/lib/backup.php';
require __DIR__ . '/lib/api.php';

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
  $all = $bt->fetchAll();
  // Owner preview: a logged-in admin can preview the page with cloaking bypassed
  // (shows every enabled button) without affecting stats.
  $ownerPreview = isset($_GET['preview']) && pp_current_user();
  if ($ownerPreview) {
    $visible = array_values(array_filter($all, fn($b) => !empty($b['enabled'])));
  } else {
    $visible = array_values(array_filter($all, fn($b) => pp_button_visible($b, $ctx)));
    // "Blocked" = visitor landed but every button was cloaked away.
    $blockedVisit = count($all) > 0 && count($visible) === 0;
    if (!$ctx['isBot']) db()->prepare('UPDATE pages SET views = views + 1 WHERE id = ?')->execute([$page['id']]);
    pp_log_event($blockedVisit ? 'page_blocked' : 'page_view', $page['id'], $ctx);
  }
  header('Cache-Control: no-store');
  echo pp_render_page($page, $visible, $ownerPreview); exit;
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
