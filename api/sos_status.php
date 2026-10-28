<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/response.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  json_response(['success' => false, 'message' => 'GET method required.'], 405);
}
$token = trim($_GET['token'] ?? '');
if (!preg_match('/^[a-f0-9]{48}$/', $token)) {
  json_response(['success' => false, 'message' => 'Invalid tracking link.'], 422);
}
$st = db()->prepare(
  'SELECT i.incident_no,i.category,i.priority,i.status,i.created_at,i.updated_at FROM incidents i WHERE i.public_token=? LIMIT 1',
);
$st->execute([$token]);
$x = $st->fetch();
if (!$x) {
  json_response(['success' => false, 'message' => 'Emergency report not found.'], 404);
}
json_response(['success' => true, 'incident' => $x]);
