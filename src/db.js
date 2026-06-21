'use strict';

const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');

// Make sure the data + uploads directories exist before we touch the DB.
fs.mkdirSync(config.DATA_DIR, { recursive: true });
fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });

const db = new Database(config.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS pages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT UNIQUE NOT NULL,
      title       TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      avatar      TEXT NOT NULL DEFAULT '',
      theme       TEXT NOT NULL DEFAULT '{}',
      published   INTEGER NOT NULL DEFAULT 1,
      views       INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS buttons (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id         INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      label           TEXT NOT NULL DEFAULT '',
      url             TEXT NOT NULL DEFAULT '',
      icon            TEXT NOT NULL DEFAULT '',
      bg_color        TEXT NOT NULL DEFAULT '#111827',
      text_color      TEXT NOT NULL DEFAULT '#ffffff',
      style           TEXT NOT NULL DEFAULT 'filled',  -- filled | outline | soft | pill
      sort_order      INTEGER NOT NULL DEFAULT 0,
      enabled         INTEGER NOT NULL DEFAULT 1,
      cloak_mode      TEXT NOT NULL DEFAULT 'off',     -- off | allow | block
      cloak_countries TEXT NOT NULL DEFAULT '',        -- CSV of ISO country codes
      clicks          INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS short_links (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      code            TEXT UNIQUE NOT NULL,
      target_url      TEXT NOT NULL,
      title           TEXT NOT NULL DEFAULT '',
      enabled         INTEGER NOT NULL DEFAULT 1,
      cloak_mode      TEXT NOT NULL DEFAULT 'off',
      cloak_countries TEXT NOT NULL DEFAULT '',
      cloak_fallback  TEXT NOT NULL DEFAULT '',        -- URL to send blocked visitors to (optional)
      clicks          INTEGER NOT NULL DEFAULT 0,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,         -- page_view | button_click | short_click | short_blocked
      ref_id     INTEGER,
      country    TEXT NOT NULL DEFAULT 'XX',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bot_ips (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      cidr       TEXT UNIQUE NOT NULL,   -- IPv4 address or CIDR range
      note       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_buttons_page ON buttons(page_id);
    CREATE INDEX IF NOT EXISTS idx_events_type  ON events(type);
  `);
}

function seedAdmin() {
  const has = db.prepare(`SELECT value FROM settings WHERE key = 'admin_username'`).get();
  if (has) return;
  const hash = bcrypt.hashSync(config.ADMIN_PASSWORD, 10);
  const insert = db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)`);
  insert.run('admin_username', config.ADMIN_USERNAME);
  insert.run('admin_password', hash);
  insert.run('site_title', 'page-page');
  console.log(`[db] Seeded admin user "${config.ADMIN_USERNAME}".`);
}

// Add a column to an existing table only if it is missing (lightweight migration).
function ensureColumn(table, col, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

// Seed a starter list of well-known crawler / datacenter ranges. Users can
// extend or remove these from the panel; the list is only a convenience.
function seedBots() {
  if (getSetting('bots_seeded')) return;
  const defaults = [
    ['66.249.64.0/19', 'Googlebot'],
    ['64.233.160.0/19', 'Google'],
    ['157.55.39.0/24', 'Bingbot'],
    ['40.77.167.0/24', 'Bingbot'],
    ['31.13.24.0/21', 'Facebook'],
    ['69.171.224.0/19', 'Facebook'],
    ['173.252.64.0/18', 'Facebook'],
    ['199.16.156.0/22', 'Twitter/X'],
  ];
  const ins = db.prepare(`INSERT OR IGNORE INTO bot_ips (cidr, note) VALUES (?, ?)`);
  db.transaction(() => defaults.forEach(([c, n]) => ins.run(c, n)))();
  setSetting('bots_seeded', '1');
}

migrate();
// --- incremental migrations ---
ensureColumn('buttons', 'start_at', `start_at TEXT NOT NULL DEFAULT ''`); // schedule visible-from
ensureColumn('buttons', 'end_at', `end_at TEXT NOT NULL DEFAULT ''`); // schedule visible-until

// Advanced cloaking fields, shared by buttons + short_links.
for (const t of ['buttons', 'short_links']) {
  ensureColumn(t, 'cloak_bots', `cloak_bots TEXT NOT NULL DEFAULT 'off'`); // off | hide
  ensureColumn(t, 'cloak_devices', `cloak_devices TEXT NOT NULL DEFAULT ''`); // '' | mobile | desktop
  ensureColumn(t, 'cloak_ref_mode', `cloak_ref_mode TEXT NOT NULL DEFAULT 'off'`); // off | allow | block
  ensureColumn(t, 'cloak_ref_list', `cloak_ref_list TEXT NOT NULL DEFAULT ''`); // CSV of referrer substrings
}

// Per-page tracking pixels.
ensureColumn('pages', 'pixels', `pixels TEXT NOT NULL DEFAULT '{}'`);

// Bot-aware analytics.
ensureColumn('events', 'is_bot', `is_bot INTEGER NOT NULL DEFAULT 0`);
ensureColumn('events', 'ua', `ua TEXT NOT NULL DEFAULT ''`);
ensureColumn('events', 'ip', `ip TEXT NOT NULL DEFAULT ''`);

seedAdmin();
seedBots();

// --- Settings helpers -------------------------------------------------------
function getSetting(key, fallback = null) {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

module.exports = { db, getSetting, setSetting };
