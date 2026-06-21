'use strict';

// CLI export: `node scripts/export.js [outputPath]`
// Produces a single .zip containing the SQLite database + all uploads.

const fs = require('fs');
const path = require('path');
const { exportAll } = require('../src/backup');

(async () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = process.argv[2] || path.join('backups', `page-page-backup-${stamp}.zip`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });

  const { buffer, manifest } = await exportAll();
  fs.writeFileSync(out, buffer);

  console.log(`Export selesai -> ${out}`);
  console.log(`Isi:`, manifest.tables);
  process.exit(0);
})().catch((e) => {
  console.error('Export gagal:', e.message);
  process.exit(1);
});
