<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/profile_picture.php';
$user = require_login();
$pdo = db();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  json_response(['success' => true, 'user' => $user]);
}

if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
  $d = request_body();
  $profile = validate_profile_picture($d['profile_picture'] ?? null);
  $pdo
    ->prepare('UPDATE users SET profile_picture=? WHERE id=?')
    ->execute([$profile, (int) $user['id']]);
  $q = $pdo->prepare(
    'SELECT id,username,full_name,role,status,profile_picture FROM users WHERE id=? LIMIT 1',
  );
  $q->execute([(int) $user['id']]);
  json_response([
    'success' => true,
    'message' => 'Profile picture updated successfully.',
    'user' => $q->fetch(),
  ]);
}

json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
