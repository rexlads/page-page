<?php
// Cookie-based admin auth: an HMAC-signed token (JWT-like) + bcrypt passwords.

const PP_COOKIE = 'pp_token';

function pp_b64url($s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function pp_b64url_dec($s) {
  $s = strtr($s, '-_', '+/');
  $pad = strlen($s) % 4; if ($pad) $s .= str_repeat('=', 4 - $pad);
  return base64_decode($s);
}

function pp_issue_token($user) {
  $payload = pp_b64url(json_encode(['sub' => $user, 'exp' => time() + 7 * 86400]));
  $sig = pp_b64url(hash_hmac('sha256', $payload, get_setting('jwt_secret'), true));
  return $payload . '.' . $sig;
}

function pp_verify_token($token) {
  if (!$token || strpos($token, '.') === false) return null;
  [$payload, $sig] = explode('.', $token, 2);
  $expected = pp_b64url(hash_hmac('sha256', $payload, get_setting('jwt_secret'), true));
  if (!hash_equals($expected, $sig)) return null;
  $data = json_decode(pp_b64url_dec($payload), true);
  if (!is_array($data) || ($data['exp'] ?? 0) < time()) return null;
  return $data;
}

function pp_verify_credentials($user, $pass) {
  $u = get_setting('admin_username');
  $h = get_setting('admin_password');
  if (!$u || !$h || $user !== $u) return false;
  return password_verify((string)$pass, $h);
}

function pp_change_password($new) {
  set_setting('admin_password', password_hash((string)$new, PASSWORD_BCRYPT));
}

function pp_current_user() {
  $token = $_COOKIE[PP_COOKIE] ?? '';
  $data = pp_verify_token($token);
  return $data ? ($data['sub'] ?? null) : null;
}

function pp_require_auth() {
  if (!pp_current_user()) json_out(['error' => 'Not authenticated'], 401);
}

function pp_set_login_cookie($token) {
  $secure = pp_base_url()[4] === 's'; // https://
  setcookie(PP_COOKIE, $token, [
    'expires' => time() + 7 * 86400,
    'path' => '/',
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => $secure,
  ]);
}
function pp_clear_login_cookie() {
  setcookie(PP_COOKIE, '', ['expires' => time() - 3600, 'path' => '/']);
}
