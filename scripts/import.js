'use strict';

// CLI import: `node scripts/import.js <backup.zip>`
// Restores the database + uploads from an exported .zip. This OVERWRITES the
// current data, so stop the server (or run while it is stopped) before importing.

const fs = require('fs');
const { importAll } = require('../src/backup');

const file = process.argv[2];
if (!file) {
  console.error('Pemakaian: node scripts/import.js <backup.zip>');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`File tidak ditemukan: ${file}`);
  process.exit(1);
}

try {
  const result = importAll(fs.readFileSync(file));
  console.log('Import selesai. Baris yang dipulihkan:', result);
  process.exit(0);
} catch (e) {
  console.error('Import gagal:', e.message);
  process.exit(1);
}
