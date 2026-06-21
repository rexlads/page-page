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

migrate();
seedAdmin();

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
