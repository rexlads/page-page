<?php
// Small shared helpers: routing, JSON, request parsing, base URL.

function pp_base_url() {
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || (isset($_SERVER['HTTP_CF_VISITOR']) && strpos($_SERVER['HTTP_CF_VISITOR'], 'https') !== false)
        || (($_SERVER['SERVER_PORT'] ?? '') == 443);
  $scheme = $https ? 'https' : 'http';
  $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
  return $scheme . '://' . $host;
}

// Path of the current request relative to the app root (handles subfolder installs).
function pp_path() {
  $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
  // If the app lives in a subdirectory, strip that prefix (mount = dir of index.php).
  $script = $_SERVER['SCRIPT_NAME'] ?? '';
  if (substr($script, -10) === '/index.php') {
    $base = rtrim(substr($script, 0, -10), '/');
    if ($base !== '' && strpos($uri, $base) === 0) $uri = substr($uri, strlen($base));
  }
  if ($uri === '') $uri = '/';
  return rawurldecode($uri);
}

function pp_method() { return $_SERVER['REQUEST_METHOD'] ?? 'GET'; }

function json_out($data, $code = 200) {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
  exit;
}

function body_json() {
  $raw = file_get_contents('php://input');
  $d = json_decode($raw, true);
  return is_array($d) ? $d : [];
}

function e($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

const PP_RESERVED = [
  'panel', 'api', 'r', 'assets', 'static', 'public', 'admin',
  'login', 'logout', 'favicon.ico', 'robots.txt', 's', 'go', 'health',
  'uploads', 'data', 'index.php',
];
function pp_reserved($h) { return in_array(strtolower($h), PP_RESERVED, true); }

function csv_lower($s) {
  $out = [];
  foreach (explode(',', (string)$s) as $x) {
    $x = strtolower(trim($x));
    if ($x !== '') $out[] = $x;
  }
  return implode(',', array_unique($out));
}
function csv_upper($s) {
  $out = [];
  foreach (explode(',', (string)$s) as $x) {
    $x = strtoupper(trim($x));
    if ($x !== '') $out[] = $x;
  }
  return implode(',', array_unique($out));
}
