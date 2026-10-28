<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/sos_limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  json_response(['success' => false, 'message' => 'GET method required.'], 405);
}

$pdo = db();
$key = sos_client_keys(null);
$count = get_sos_report_count($pdo, $key);
$remaining = max(0, SOS_MAX_REPORTS - $count);

json_response([
  'success' => true,
  'max_reports' => SOS_MAX_REPORTS,
  'report_count' => $count,
  'remaining' => $remaining,
  'blocked' => $remaining === 0,
]);
