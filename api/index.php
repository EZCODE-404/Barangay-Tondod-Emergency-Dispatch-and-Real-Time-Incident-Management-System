<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
  'system' => 'Barangay Emergency Dispatch System',
  'status' => 'online',
  'message' => 'Backend API is running.',
]);
