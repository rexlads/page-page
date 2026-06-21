<?php
// Export/import the whole install (SQLite DB + uploads) as one .zip. No deps.

const PP_TABLES = ['settings', 'pages', 'buttons', 'short_links', 'events', 'bot_ips', 'dc_ips'];

function pp_export_zip() {
  db()->exec('PRAGMA wal_checkpoint(TRUNCATE)');
  $tmpDb = tempnam(sys_get_temp_dir(), 'ppdb');
  copy(PP_DB_PATH, $tmpDb);

  $tmpZip = tempnam(sys_get_temp_dir(), 'ppzip');
  $zip = new ZipArchive();
  $zip->open($tmpZip, ZipArchive::OVERWRITE);
  $zip->addFile($tmpDb, 'app.db');

  if (is_dir(PP_UPLOADS_DIR)) {
    foreach (scandir(PP_UPLOADS_DIR) as $f) {
      if ($f === '.' || $f === '..' || $f === '.htaccess') continue;
      $full = PP_UPLOADS_DIR . '/' . $f;
      if (is_file($full)) $zip->addFile($full, 'uploads/' . $f);
    }
  }

  $counts = [];
  foreach (PP_TABLES as $t) {
    try { $counts[$t] = (int)db()->query("SELECT COUNT(*) c FROM $t")->fetch()['c']; } catch (Throwable $e) { $counts[$t] = null; }
  }
  $zip->addFromString('manifest.json', json_encode([
    'app' => 'page-page', 'format' => 1, 'engine' => 'php',
    'exported_at' => gmdate('c'), 'tables' => $counts,
  ], JSON_PRETTY_PRINT));
  $zip->close();

  $bytes = file_get_contents($tmpZip);
  @unlink($tmpDb); @unlink($tmpZip);
  return $bytes;
}

function pp_copy_table($src, $table) {
  try { $cols = array_column($src->query("PRAGMA table_info($table)")->fetchAll(), 'name'); }
  catch (Throwable $e) { return 0; }
  if (!$cols) return 0;
  $rows = $src->query('SELECT ' . implode(',', $cols) . " FROM $table")->fetchAll();
  db()->exec("DELETE FROM $table");
  if (!$rows) return 0;
  $ph = implode(',', array_fill(0, count($cols), '?'));
  $ins = db()->prepare("INSERT INTO $table (" . implode(',', $cols) . ") VALUES ($ph)");
  foreach ($rows as $row) {
    $vals = [];
    foreach ($cols as $c) $vals[] = $row[$c];
    $ins->execute($vals);
  }
  return count($rows);
}

function pp_import_zip($zipPath) {
  $stage = sys_get_temp_dir() . '/ppimp_' . bin2hex(random_bytes(6));
  mkdir($stage, 0775, true);
  $zip = new ZipArchive();
  if ($zip->open($zipPath) !== true) throw new Exception('File zip tidak valid');
  $zip->extractTo($stage);
  $zip->close();

  $dbFile = $stage . '/app.db';
  if (!is_file($dbFile)) { pp_rrmdir($stage); throw new Exception('Backup tidak valid: app.db tidak ditemukan'); }

  $src = new PDO('sqlite:' . $dbFile);
  $src->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  $src->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

  $result = [];
  db()->exec('PRAGMA foreign_keys = OFF');
  db()->beginTransaction();
  try {
    foreach (PP_TABLES as $t) $result[$t] = pp_copy_table($src, $t);
    db()->commit();
  } catch (Throwable $e) {
    db()->rollBack();
    db()->exec('PRAGMA foreign_keys = ON');
    pp_rrmdir($stage);
    throw $e;
  }
  db()->exec('PRAGMA foreign_keys = ON');

  $upDir = $stage . '/uploads';
  if (is_dir($upDir)) {
    foreach (scandir($upDir) as $f) {
      if ($f === '.' || $f === '..') continue;
      if (is_file($upDir . '/' . $f)) copy($upDir . '/' . $f, PP_UPLOADS_DIR . '/' . $f);
    }
  }
  pp_rrmdir($stage);
  return $result;
}

function pp_rrmdir($dir) {
  if (!is_dir($dir)) return;
  foreach (scandir($dir) as $f) {
    if ($f === '.' || $f === '..') continue;
    $p = $dir . '/' . $f;
    is_dir($p) ? pp_rrmdir($p) : @unlink($p);
  }
  @rmdir($dir);
}
