<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
$u = require_responder();
$pdo = db();
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $d = request_body();
  $key = trim((string) ($d['device_key'] ?? ''));
  if ($key === '' || strlen($key) > 128) {
    json_response(['success' => false, 'message' => 'A valid device key is required.'], 422);
  }
  try {
    $st = $pdo->prepare(
      'INSERT INTO responder_devices(user_id,device_key,device_name,user_agent,last_seen,active) VALUES(?,?,?,?,NOW(),1) ON DUPLICATE KEY UPDATE device_name=VALUES(device_name),user_agent=VALUES(user_agent),last_seen=NOW(),active=1',
    );
    $st->execute([
      (int) $u['id'],
      $key,
      trim((string) ($d['device_name'] ?? 'Unknown device')),
      substr((string) ($d['user_agent'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? '')), 0, 500),
    ]);
    json_response([
      'success' => true,
      'message' => 'This device is registered for responder notifications.',
    ]);
  } catch (Throwable $e) {
    json_response(
      [
        'success' => false,
        'message' => 'Device registration requires the device notification database migration.',
      ],
      500,
    );
  }
}
if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
  $d = request_body();
  $key = trim((string) ($d['device_key'] ?? ''));
  if ($key === '') {
    json_response(['success' => false, 'message' => 'Device key is required.'], 422);
  }
  try {
    $st = $pdo->prepare(
      'UPDATE responder_devices SET last_seen=NOW(),active=? WHERE user_id=? AND device_key=?',
    );
    $st->execute([!empty($d['active']) ? 1 : 0, (int) $u['id'], $key]);
    json_response(['success' => true]);
  } catch (Throwable $e) {
    json_response(
      ['success' => false, 'message' => 'Device notification table is not installed.'],
      500,
    );
  }
}
json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
