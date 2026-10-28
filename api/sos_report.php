<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/response.php';
// Public endpoint: SOS reports must be submit-able without an account. Rate-limited by a first-party browser cookie.
require_once __DIR__ . '/../includes/notify.php';
require_once __DIR__ . '/../includes/sos_limit.php';
require_once __DIR__ . '/../includes/incident_insert.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_response(['success' => false, 'message' => 'POST method required.'], 405);
}

// Bound the complete multipart request, including form fields and boundaries.
const MAX_SOS_REQUEST_BYTES = 8 * 1024 * 1024;
$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > MAX_SOS_REQUEST_BYTES) {
  json_response(
    ['success' => false, 'message' => 'SOS request is too large. Photos and form data must fit within 8 MB.'],
    413,
  );
}
$d =
  stripos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') !== false
    ? $_POST
    : request_body();
$cat = trim($d['category'] ?? 'Others');
if ($cat === 'Road Accident') {
  $cat = 'Security Concern';
}
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
$loc = trim($d['location'] ?? '');
if ($loc === '') {
  json_response(['success' => false, 'message' => 'Location is required.'], 422);
}
$phone = trim((string) ($d['contact_number'] ?? ''));
$phoneDigits = preg_replace('/\\D+/', '', $phone);
if ($phone === '' || strlen($phoneDigits) < 7 || strlen($phoneDigits) > 15) {
  json_response(['success' => false, 'message' => 'A valid contact number is required (7 to 15 digits).'], 422);
}
if (!isset($_FILES['incident_photo']) || ($_FILES['incident_photo']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
  json_response(['success' => false, 'message' => 'An incident photo is required. Please capture or upload a photo.'], 422);
}
$pdo = db();
$clientKey = sos_client_keys(null);
$currentCount = get_sos_report_count($pdo, $clientKey);
if ($currentCount >= SOS_MAX_REPORTS) {
  json_response(
    [
      'success' => false,
      'message' =>
        'SOS reporting limit reached for today. If this is a genuine emergency, contact the barangay emergency hotline directly.',
      'report_count' => $currentCount,
      'remaining' => 0,
      'limit_reached' => true,
    ],
    429,
  );
}
// Check the secondary source-IP ceiling before inspecting the uploaded image.
// The cookie/account count above remains the visible daily counter.
if (
  isset($clientKey[1]) &&
  get_sos_report_count($pdo, [$clientKey[1]]) >= SOS_IP_MAX_REPORTS
) {
  json_response(
    [
      'success' => false,
      'message' => 'Too many SOS reports have come from this network today. If this is a genuine emergency, contact the barangay emergency hotline directly.',
      'remaining' => 0,
      'limit_reached' => true,
    ],
    429,
  );
}
$token = bin2hex(random_bytes(24));
$no = 'SOS-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
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
$name = trim($d['reporter_name'] ?? '');
$imagePath = null;
$uploadDir = __DIR__ . '/../uploads/sos';
$uploadFile = null;
$uploadFilename = null;

// Validate the temporary upload before reserving a report slot or saving a file.
if (
  !empty($_FILES['incident_photo']) &&
  ($_FILES['incident_photo']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE
) {
  $uploadFile = $_FILES['incident_photo'];
  if (($uploadFile['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
    json_response(
      ['success' => false, 'message' => 'Photo upload failed. Please try another image.'],
      422,
    );
  }
  if (($uploadFile['size'] ?? 0) > 5 * 1024 * 1024) {
    json_response(['success' => false, 'message' => 'Photo must be 5 MB or smaller.'], 413);
  }
  if (empty($uploadFile['tmp_name']) || !is_uploaded_file($uploadFile['tmp_name'])) {
    json_response(['success' => false, 'message' => 'Invalid photo upload. Please try another image.'], 422);
  }
  $info = @getimagesize($uploadFile['tmp_name']);
  $mime = $info['mime'] ?? '';
  $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
  if (!isset($extensions[$mime])) {
    json_response(['success' => false, 'message' => 'Use a JPG, PNG, or WEBP photo.'], 422);
  }
  $uploadFilename = 'sos-' . date('Ymd-His') . '-' . bin2hex(random_bytes(8)) . '.' . $extensions[$mime];
}
$newCount = begin_sos_report_slot($pdo, $clientKey);
if ($newCount === false) {
  json_response(
    [
      'success' => false,
      'message' =>
        'SOS reporting limit reached for today. If this is a genuine emergency, contact the barangay emergency hotline directly.',
      'report_count' => SOS_MAX_REPORTS,
      'remaining' => 0,
      'limit_reached' => true,
    ],
    429,
  );
}
$savedFilePath = null;
try {
  // begin_sos_report_slot() reserves the client and IP slots in an open
  // transaction. Only now move the image into permanent storage.
  if ($uploadFile !== null && $uploadFilename !== null) {
    if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0755, true)) {
      throw new RuntimeException('Photo storage is not available.');
    }
    $savedFilePath = $uploadDir . '/' . $uploadFilename;
    if (!move_uploaded_file($uploadFile['tmp_name'], $savedFilePath)) {
      $savedFilePath = null;
      throw new RuntimeException('Could not save the photo.');
    }
    $imagePath = 'uploads/sos/' . $uploadFilename;
  }

  $id = insert_incident($pdo, [
    'incident_no' => $no,
    'category' => $cat,
    'location' => $loc,
    'description' => trim($d['description'] ?? 'Bystander SOS emergency report.'),
    'priority' => 'Critical',
    'reporter_name' => $name,
    'reporter_phone' => $phone,
    'status' => 'Pending',
    'source' => 'SOS',
    'latitude' => $lat,
    'longitude' => $lng,
    'gps_accuracy' => $accuracy,
    'public_token' => $token,
    'image_path' => $imagePath,
  ]);
  $pdo->commit();
} catch (Throwable $e) {
  if ($pdo->inTransaction()) {
    $pdo->rollBack();
  }
  if ($savedFilePath !== null && is_file($savedFilePath)) {
    @unlink($savedFilePath);
  }
  error_log('[SOS report] Failed to save report: ' . $e->getMessage());
  json_response(
    ['success' => false, 'message' => 'Unable to save SOS report. Please try again.'],
    500,
  );
}
json_response(
  [
    'success' => true,
    'message' => 'SOS received by emergency dispatch.',
    'incident_no' => $no,
    'image_path' => $imagePath,
    'incident_id' => $id,
    'tracking_token' => $token,
    'reported_at' => date('Y-m-d H:i:s'),
    'report_count' => $newCount,
    'remaining' => max(0, SOS_MAX_REPORTS - $newCount),
  ],
  201,
);
