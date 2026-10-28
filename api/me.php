<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
$user = require_login();
json_response(['success' => true, 'user' => $user]);
