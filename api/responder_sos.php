<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/notify.php';
require_once __DIR__ . '/../includes/sos_limit.php';
require_once __DIR__ . '/../includes/incident_insert.php';
$u = require_responder();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_response(['success' => false, 'message' => 'POST method required.'], 405);
}
$d = request_body();
$cat = trim((string) ($d['category'] ?? 'Others'));
$allowed = [
  'Medical Emergency',
  'Fire Incident',
  'Security Concern',
  'Disaster / Natural Calamity',
  'Others',
];
if (!in_array($cat, $allowed, true)) {
  $cat = 'Others';
}
$loc = trim((string) ($d['location'] ?? ''));
if ($loc === '') {
  json_response(['success' => false, 'message' => 'Location is required.'], 422);
}
$lat = ($d['latitude'] ?? '') === '' ? null : (float) $d['latitude'];
$lng = ($d['longitude'] ?? '') === '' ? null : (float) $d['longitude'];
$accuracy = ($d['gps_accuracy'] ?? '') === '' ? null : (float) $d['gps_accuracy'];
if (
  ($lat !== null && ($lat < -90 || $lat > 90)) ||
  ($lng !== null && ($lng < -180 || $lng > 180))
) {
  json_response(['success' => false, 'message' => 'Invalid GPS coordinates.'], 422);
}
if ($accuracy !== null && ($accuracy < 0 || $accuracy > 100000)) {
  $accuracy = null;
}
$pdo = db();
$clientKey = sos_client_keys($u);
$currentCount = get_sos_report_count($pdo, $clientKey);
if ($currentCount >= SOS_MAX_REPORTS) {
  json_response(
    [
      'success' => false,
      'message' =>
        'Daily SOS report limit reached for this responder account. Contact the administrator if a further report is required.',
      'report_count' => $currentCount,
      'remaining' => 0,
      'limit_reached' => true,
    ],
    429,
  );
}
$token = bin2hex(random_bytes(24));
$no = 'SOS-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
$newCount = begin_sos_report_slot($pdo, $clientKey);
if ($newCount === false) {
  json_response(
    [
      'success' => false,
      'message' =>
        'Daily SOS report limit reached for this responder account. Contact the administrator if a further report is required.',
      'report_count' => SOS_MAX_REPORTS,
      'remaining' => 0,
      'limit_reached' => true,
    ],
    429,
  );
}
try {
  $id = insert_incident($pdo, [
    'incident_no' => $no,
    'category' => $cat,
    'location' => $loc,
    'description' => trim((string) ($d['description'] ?? 'Responder SOS emergency report.')),
    'priority' => 'Critical',
    'reporter_name' => $u['full_name'],
    'reporter_phone' => trim((string) ($d['contact_number'] ?? '')),
    'reported_by' => (int) $u['id'],
    'status' => 'Pending',
    'source' => 'SOS-Responder',
    'latitude' => $lat,
    'longitude' => $lng,
    'gps_accuracy' => $accuracy,
    'public_token' => $token,
  ]);
  $pdo->commit();
} catch (Throwable $e) {
  if ($pdo->inTransaction()) {
    $pdo->rollBack();
  }
  json_response(
    ['success' => false, 'message' => 'Unable to save responder SOS. Please try again.'],
    500,
  );
}
// This report must go to the administrator queue first. Notify only the responder selected
// by the administrator through api/incidents.php when dispatching.
json_response(
  [
    'success' => true,
    'message' => 'Responder SOS received.',
    'incident_no' => $no,
    'incident_id' => $id,
    'tracking_token' => $token,
    'reported_at' => date('Y-m-d H:i:s'),
    'report_count' => $newCount,
    'remaining' => max(0, SOS_MAX_REPORTS - $newCount),
  ],
  201,
);
