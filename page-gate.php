<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/database.php';

function gate_redirect(string $url): never
{
  header('Location: ' . $url, true, 302);
  exit();
}

$page = strtolower(trim((string) ($_GET['page'] ?? '')));
if ($page === 'bystander-sos' || $page === 'sos') {
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  header('Content-Type: text/html; charset=UTF-8');
  readfile(__DIR__ . '/public/bystander-sos.html');
  exit();
}

// Latest Incidents is a public read-only display. It is intentionally
// accessible directly by URL without an authenticated session.
if ($page === 'latest-incidents') {
  header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
  header('Pragma: no-cache');
  header('Content-Type: text/html; charset=UTF-8');
  readfile(__DIR__ . '/pages/latest-incidents.html');
  exit();
}

$allowed = [
  'dashboard' => ['Super Admin', 'Administrator'],
  'responder' => ['Responder'],
  'latest-incidents' => ['Super Admin', 'Administrator', 'Responder'],
  'responder-sos' => ['Responder'],
];

if (!isset($allowed[$page])) {
  http_response_code(404);
  exit('Page not found.');
}

if (empty($_SESSION['user_id'])) {
  gate_redirect('login.html');
}

try {
  $stmt = db()->prepare(
    'SELECT id, username, full_name, role, status FROM users WHERE id=? LIMIT 1',
  );
  $stmt->execute([(int) $_SESSION['user_id']]);
  $user = $stmt->fetch();
} catch (Throwable $e) {
  gate_redirect('login.html');
}

if (!$user || strtolower((string) $user['status']) !== 'active') {
  $_SESSION = [];
  if (ini_get('session.use_cookies')) {
    $params = session_get_cookie_params();
    setcookie(
      session_name(),
      '',
      time() - 42000,
      $params['path'],
      $params['domain'],
      $params['secure'],
      $params['httponly'],
    );
  }
  session_destroy();
  gate_redirect('login.html');
}

// Normalize role values so harmless capitalization/whitespace differences do not
// cause a valid account to be sent back to the login page.
$role = trim((string) $user['role']);
$roleKey = strtolower($role);
$allowedKeys = array_map(static fn($r) => strtolower(trim((string) $r)), $allowed[$page]);

if (!in_array($roleKey, $allowedKeys, true)) {
  // Do not bounce between role dashboards on refresh. A single PHP session
  // represents one logged-in account; if the role does not match this page,
  // return to login instead of silently switching dashboards.
  gate_redirect('login.html?role_mismatch=1');
}

$files = [
  'dashboard' => __DIR__ . '/pages/dashboard.html',
  'responder' => __DIR__ . '/pages/responder.html',
  'latest-incidents' => __DIR__ . '/pages/latest-incidents.html',
  'responder-sos' => __DIR__ . '/pages/responder-sos.html',
];

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Content-Type: text/html; charset=UTF-8');
readfile($files[$page]);
exit();
