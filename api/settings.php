<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';

$defaults = ['barangay_name' => 'Barangay Tondod', 'city' => 'San Jose City', 'hotline' => '911'];
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Public pages use these three display settings. A GET must be read-only and
// must never create tables or seed records as a side effect.
if ($method === 'GET') {
  $settings = $defaults;
  try {
    $rows = db()->query('SELECT setting_key,setting_value FROM system_settings')->fetchAll();
    foreach ($rows as $row) {
      if (array_key_exists($row['setting_key'], $defaults)) {
        $settings[$row['setting_key']] = (string) $row['setting_value'];
      }
    }
  } catch (Throwable $e) {
    error_log('[settings.php] Unable to read public settings: ' . $e->getMessage());
    // Keep public SOS pages usable with safe defaults if settings are absent.
  }
  json_response(['success' => true, 'settings' => $settings]);
}

$user = require_admin();
if ($method !== 'POST') {
  json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
}
$pdo = db();
$body = request_body();
$values = [
  'barangay_name' => trim((string) ($body['barangay_name'] ?? '')),
  'city' => trim((string) ($body['city'] ?? '')),
  'hotline' => trim((string) ($body['hotline'] ?? '')),
];
foreach ($values as $key => $value) {
  if ($value === '') {
    json_response(
      ['success' => false, 'message' => ucwords(str_replace('_', ' ', $key)) . ' is required.'],
      422,
    );
  }
  if (strlen($value) > 255) {
    json_response(
      ['success' => false, 'message' => ucwords(str_replace('_', ' ', $key)) . ' is too long.'],
      422,
    );
  }
}
try {
  $stmt = $pdo->prepare(
    'INSERT INTO system_settings(setting_key,setting_value) VALUES(?,?) ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value)',
  );
  $pdo->beginTransaction();
  foreach ($values as $key => $value) {
    $stmt->execute([$key, $value]);
  }
  $pdo->commit();
} catch (Throwable $e) {
  if ($pdo->inTransaction()) {
    $pdo->rollBack();
  }
  error_log('[settings.php] Settings update failed: ' . $e->getMessage());
  json_response(
    ['success' => false, 'message' => 'Settings could not be saved. Please try again.'],
    500,
  );
}
json_response([
  'success' => true,
  'message' => 'Settings saved and applied across the deployment.',
  'settings' => $values,
]);
