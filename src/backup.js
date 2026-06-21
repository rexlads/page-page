'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const Database = require('better-sqlite3');
const config = require('./config');
const { db } = require('./db');

const TABLES = ['settings', 'pages', 'buttons', 'short_links', 'events', 'bot_ips'];

// ---------------------------------------------------------------------------
// EXPORT: produce a single .zip Buffer containing a consistent DB snapshot,
// every uploaded file, and a manifest. This is the whole domain in one file.
// ---------------------------------------------------------------------------
async function exportAll() {
  // Fold the WAL back into the main file so the snapshot is complete.
  db.pragma('wal_checkpoint(TRUNCATE)');

  const tmpDb = path.join(os.tmpdir(), `pp-export-${Date.now()}.db`);
  await db.backup(tmpDb); // consistent, hot-safe snapshot

  const zip = new AdmZip();
  zip.addLocalFile(tmpDb, '', 'app.db');

  if (fs.existsSync(config.UPLOADS_DIR)) {
    zip.addLocalFolder(config.UPLOADS_DIR, 'uploads');
  }

  const counts = {};
  for (const t of TABLES) {
    try {
      counts[t] = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    } catch (_) {
      counts[t] = null;
    }
  }

  const manifest = {
    app: 'page-page',
    format: 1,
    exported_at: new Date().toISOString(),
    tables: counts,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));

  const buffer = zip.toBuffer();
  fs.rmSync(tmpDb, { force: true });
  return { buffer, manifest };
}

// Copy every row of `table` from the source DB into the live DB.
function copyTable(source, table) {
  let cols;
  try {
    cols = source.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  } catch (_) {
    return 0; // table absent in the imported file -> skip
  }
  if (!cols.length) return 0;

  const rows = source.prepare(`SELECT ${cols.join(',')} FROM ${table}`).all();
  db.prepare(`DELETE FROM ${table}`).run();
  if (!rows.length) return 0;

  const placeholders = cols.map(() => '?').join(',');
  const insert = db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`);
  for (const row of rows) insert.run(cols.map((c) => row[c]));
  return rows.length;
}

// ---------------------------------------------------------------------------
// IMPORT: replace the current data with the contents of an exported .zip.
// Data is copied row-by-row into the live connection (inside a transaction),
// so no server restart is required. Uploads are overwritten on disk.
// ---------------------------------------------------------------------------
function importAll(zipBuffer, { wipeUploads = true } = {}) {
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-import-'));
  try {
    new AdmZip(zipBuffer).extractAllTo(stage, true);

    const dbFile = path.join(stage, 'app.db');
    if (!fs.existsSync(dbFile)) {
      throw new Error('Invalid backup: app.db not found in archive.');
    }

    const source = new Database(dbFile, { readonly: true });
    const result = {};
    try {
      const txn = db.transaction(() => {
        db.pragma('foreign_keys = OFF');
        for (const t of TABLES) result[t] = copyTable(source, t);
        db.pragma('foreign_keys = ON');
      });
      txn();
    } finally {
      source.close();
    }

    // Restore uploaded files.
    const stagedUploads = path.join(stage, 'uploads');
    if (fs.existsSync(stagedUploads)) {
      if (wipeUploads && fs.existsSync(config.UPLOADS_DIR)) {
        fs.rmSync(config.UPLOADS_DIR, { recursive: true, force: true });
      }
      fs.mkdirSync(config.UPLOADS_DIR, { recursive: true });
      fs.cpSync(stagedUploads, config.UPLOADS_DIR, { recursive: true });
    }

    return result;
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

module.exports = { exportAll, importAll, TABLES };
