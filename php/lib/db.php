<?php
// SQLite (PDO) setup, schema migrations, and seed data. No external deps.

define('PP_DATA_DIR', __DIR__ . '/../data');
define('PP_UPLOADS_DIR', __DIR__ . '/../uploads');
define('PP_DB_PATH', PP_DATA_DIR . '/app.db');

if (!is_dir(PP_DATA_DIR)) @mkdir(PP_DATA_DIR, 0775, true);
if (!is_dir(PP_UPLOADS_DIR)) @mkdir(PP_UPLOADS_DIR, 0775, true);
// Defense in depth: block web access to the database folder even if the app's
// main .htaccess is missing/ignored by the server.
$pp_data_ht = PP_DATA_DIR . '/.htaccess';
if (!is_file($pp_data_ht)) @file_put_contents($pp_data_ht, "Require all denied\nDeny from all\n");

function db() {
  static $pdo = null;
  if ($pdo === null) {
    $pdo = new PDO('sqlite:' . PP_DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode = WAL');
    $pdo->exec('PRAGMA foreign_keys = ON');
  }
  return $pdo;
}

function get_setting($key, $fallback = null) {
  $st = db()->prepare('SELECT value FROM settings WHERE key = ?');
  $st->execute([$key]);
  $row = $st->fetch();
  return $row ? $row['value'] : $fallback;
}
function set_setting($key, $value) {
  $st = db()->prepare('INSERT INTO settings (key, value) VALUES (?, ?)
                       ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  $st->execute([$key, (string)$value]);
}

function pp_ensure_column($table, $col, $ddl) {
  $cols = db()->query("PRAGMA table_info($table)")->fetchAll();
  foreach ($cols as $c) if ($c['name'] === $col) return;
  db()->exec("ALTER TABLE $table ADD COLUMN $ddl");
}

function pp_migrate() {
  $d = db();
  $d->exec("
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT '{}',
      pixels TEXT NOT NULL DEFAULT '{}',
      published INTEGER NOT NULL DEFAULT 1,
      views INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS buttons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      label TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      bg_color TEXT NOT NULL DEFAULT '#111827',
      text_color TEXT NOT NULL DEFAULT '#ffffff',
      style TEXT NOT NULL DEFAULT 'filled',
      sort_order INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1,
      cloak_mode TEXT NOT NULL DEFAULT 'off',
      cloak_countries TEXT NOT NULL DEFAULT '',
      start_at TEXT NOT NULL DEFAULT '',
      end_at TEXT NOT NULL DEFAULT '',
      cloak_bots TEXT NOT NULL DEFAULT 'off',
      cloak_devices TEXT NOT NULL DEFAULT '',
      cloak_ref_mode TEXT NOT NULL DEFAULT 'off',
      cloak_ref_list TEXT NOT NULL DEFAULT '',
      cloak_vpn TEXT NOT NULL DEFAULT 'off',
      cloak_click_id TEXT NOT NULL DEFAULT 'off',
      cloak_os TEXT NOT NULL DEFAULT '',
      cloak_lang_mode TEXT NOT NULL DEFAULT 'off',
      cloak_lang_list TEXT NOT NULL DEFAULT '',
      clicks INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS short_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      target_url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      cloak_mode TEXT NOT NULL DEFAULT 'off',
      cloak_countries TEXT NOT NULL DEFAULT '',
      cloak_fallback TEXT NOT NULL DEFAULT '',
      cloak_bots TEXT NOT NULL DEFAULT 'off',
      cloak_devices TEXT NOT NULL DEFAULT '',
      cloak_ref_mode TEXT NOT NULL DEFAULT 'off',
      cloak_ref_list TEXT NOT NULL DEFAULT '',
      cloak_vpn TEXT NOT NULL DEFAULT 'off',
      cloak_click_id TEXT NOT NULL DEFAULT 'off',
      cloak_os TEXT NOT NULL DEFAULT '',
      cloak_lang_mode TEXT NOT NULL DEFAULT 'off',
      cloak_lang_list TEXT NOT NULL DEFAULT '',
      cloak_js_challenge INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      ref_id INTEGER,
      country TEXT NOT NULL DEFAULT 'XX',
      is_bot INTEGER NOT NULL DEFAULT 0,
      is_dc INTEGER NOT NULL DEFAULT 0,
      ua TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bot_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cidr TEXT UNIQUE NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS dc_ips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cidr TEXT UNIQUE NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_buttons_page ON buttons(page_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
  ");

  // Tolerant migrations for installs created by older builds / the Node version.
  pp_ensure_column('pages', 'pixels', "pixels TEXT NOT NULL DEFAULT '{}'");
  foreach (['buttons', 'short_links'] as $t) {
    pp_ensure_column($t, 'cloak_vpn', "cloak_vpn TEXT NOT NULL DEFAULT 'off'");
    pp_ensure_column($t, 'cloak_click_id', "cloak_click_id TEXT NOT NULL DEFAULT 'off'");
    pp_ensure_column($t, 'cloak_os', "cloak_os TEXT NOT NULL DEFAULT ''");
    pp_ensure_column($t, 'cloak_lang_mode', "cloak_lang_mode TEXT NOT NULL DEFAULT 'off'");
    pp_ensure_column($t, 'cloak_lang_list', "cloak_lang_list TEXT NOT NULL DEFAULT ''");
  }
  pp_ensure_column('short_links', 'cloak_js_challenge', "cloak_js_challenge INTEGER NOT NULL DEFAULT 0");
  pp_ensure_column('events', 'is_dc', "is_dc INTEGER NOT NULL DEFAULT 0");
}

function pp_seed() {
  if (!get_setting('admin_username')) {
    set_setting('admin_username', 'admin');
    set_setting('admin_password', password_hash('admin123', PASSWORD_BCRYPT));
    set_setting('site_title', 'page-page');
  }
  if (!get_setting('jwt_secret')) {
    set_setting('jwt_secret', bin2hex(random_bytes(48)));
  }
  if (!get_setting('bots_seeded')) {
    $b = [
      ['66.249.64.0/19','Googlebot'], ['64.233.160.0/19','Google'], ['157.55.39.0/24','Bingbot'],
      ['40.77.167.0/24','Bingbot'], ['31.13.24.0/21','Facebook'], ['69.171.224.0/19','Facebook'],
      ['173.252.64.0/18','Facebook'], ['199.16.156.0/22','Twitter/X'],
    ];
    $st = db()->prepare('INSERT OR IGNORE INTO bot_ips (cidr, note) VALUES (?, ?)');
    foreach ($b as $r) $st->execute($r);
    set_setting('bots_seeded', '1');
  }
  if (!get_setting('dc_seeded')) {
    $d = [
      ['13.32.0.0/15','AWS'],['52.0.0.0/11','AWS'],['54.144.0.0/12','AWS'],['3.208.0.0/12','AWS'],
      ['34.64.0.0/10','Google Cloud'],['35.184.0.0/13','Google Cloud'],['104.196.0.0/14','Google Cloud'],
      ['40.74.0.0/15','Azure'],['13.64.0.0/11','Azure'],['20.33.0.0/16','Azure'],
      ['157.230.0.0/16','DigitalOcean'],['159.65.0.0/16','DigitalOcean'],['167.71.0.0/16','DigitalOcean'],
      ['165.227.0.0/16','DigitalOcean'],['134.209.0.0/16','DigitalOcean'],['146.190.0.0/16','DigitalOcean'],
      ['51.38.0.0/16','OVH'],['51.68.0.0/16','OVH'],['178.32.0.0/15','OVH'],['91.121.0.0/16','OVH'],
      ['5.9.0.0/16','Hetzner'],['116.202.0.0/16','Hetzner'],['65.108.0.0/16','Hetzner'],['95.216.0.0/16','Hetzner'],
      ['45.32.0.0/16','Vultr'],['149.28.0.0/16','Vultr'],['66.42.0.0/16','Vultr'],['185.220.100.0/22','Tor exit (common)'],
    ];
    $st = db()->prepare('INSERT OR IGNORE INTO dc_ips (cidr, note) VALUES (?, ?)');
    foreach ($d as $r) $st->execute($r);
    set_setting('dc_seeded', '1');
  }
}

pp_migrate();
pp_seed();
