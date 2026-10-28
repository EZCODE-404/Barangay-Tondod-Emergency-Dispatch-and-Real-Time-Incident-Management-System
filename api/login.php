<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../includes/response.php';
require_once __DIR__ . '/../includes/csrf.php';
require_once __DIR__ . '/../includes/login_limit.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_response(['success' => false, 'message' => 'POST method required.'], 405);
}
verify_csrf_request();

$data = request_body();
$username = trim((string) ($data['username'] ?? ''));
$password = (string) ($data['password'] ?? '');

if (strlen($username) > 191 || strlen($password) > 4096) {
  json_response(['success' => false, 'message' => 'Invalid username or password.'], 422);
}

if ($username === '' || $password === '') {
  json_response(['success' => false, 'message' => 'Username and password are required.'], 422);
}

$pdo = db();
$limitKeys = login_limit_keys($username);
$retryAfter = login_limit_retry_after($pdo, $limitKeys);
if ($retryAfter > 0) {
  header('Retry-After: ' . $retryAfter);
  json_response([
    'success' => false,
    'message' => 'Too many failed login attempts. Please wait before trying again.',
    'retry_after' => $retryAfter,
  ], 429);
}

$stmt = $pdo->prepare(
  'SELECT id,username,password_hash,full_name,role,status FROM users WHERE username=? LIMIT 1',
);
$stmt->execute([$username]);
$user = $stmt->fetch();

if (
  !$user ||
  strtolower((string) $user['status']) !== 'active' ||
  !password_verify($password, $user['password_hash'])
) {
  login_limit_record_failure($pdo, $limitKeys);
  json_response(['success' => false, 'message' => 'Invalid username or password.'], 401);
}

login_limit_clear_pair($pdo, $limitKeys);

session_regenerate_id(true);
$_SESSION['user_id'] = (int) $user['id'];
$_SESSION['role'] = $user['role'];

// Normalize the stored role before deciding where the account should go.
// This keeps Bystander accounts working even if the database contains
// harmless capitalization/whitespace differences.
$role = trim((string) $user['role']);
$roleKey = strtolower($role);
if ($roleKey === 'bystander') {
  $redirect = 'bystander-sos.html';
} elseif ($roleKey === 'responder') {
  $redirect = 'responder.html';
} elseif (in_array($roleKey, ['super admin', 'administrator'], true)) {
  $redirect = 'index.html';
} else {
  $redirect = 'login.html';
}

json_response([
  'success' => true,
  'message' => 'Login successful.',
  'redirect' => $redirect,
  'user' => [
    'id' => (int) $user['id'],
    'username' => $user['username'],
    'full_name' => $user['full_name'],
    'role' => $role,
  ],
]);
