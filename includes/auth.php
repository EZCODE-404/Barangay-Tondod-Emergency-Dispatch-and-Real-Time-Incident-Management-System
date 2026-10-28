<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../config/config.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/response.php';
require_once __DIR__ . '/csrf.php';

/** Return known role labels in the exact canonical form used by API permission checks.
 * Legacy databases may contain lowercase or padded role strings (for example,
 * 'administrator '); normalize after fetching so valid admins are not denied
 * update/delete operations solely because of capitalization or whitespace.
 */
function normalize_role_label($role): string
{
  $label = trim((string) $role);
  switch (strtolower($label)) {
    case 'super admin':
      return 'Super Admin';
    case 'administrator':
      return 'Administrator';
    case 'responder':
      return 'Responder';
    case 'bystander':
      return 'Bystander';
    default:
      return $label;
  }
}

function require_login(): array
{
  if (empty($_SESSION['user_id'])) {
    json_response(['success' => false, 'message' => 'Authentication required.'], 401);
  }
  $stmt = db()->prepare(
    'SELECT id,username,full_name,role,status,profile_picture FROM users WHERE id=? LIMIT 1',
  );
  $stmt->execute([(int) $_SESSION['user_id']]);
  $user = $stmt->fetch();
  if (!$user || strtolower(trim((string) $user['status'])) !== 'active') {
    $_SESSION = [];
    session_destroy();
    json_response(['success' => false, 'message' => 'User session is no longer valid.'], 401);
  }
  verify_csrf_request();
  // Canonicalize once centrally so every protected endpoint makes consistent
  // permission decisions using the same role labels.
  $user['role'] = normalize_role_label($user['role'] ?? '');
  return $user;
}

/** True only for roles allowed to administer the system. */
function is_admin_role($role): bool
{
  return in_array(normalize_role_label($role), ['Super Admin', 'Administrator'], true);
}

/** Require an authenticated administrator for an API operation. */
function require_admin(): array
{
  $user = require_login();
  if (!is_admin_role($user['role'] ?? '')) {
    json_response(['success' => false, 'message' => 'Administrator access required.'], 403);
  }
  return $user;
}

/** Require an authenticated responder for an API operation. */
function require_responder(): array
{
  $user = require_login();
  if (normalize_role_label($user['role'] ?? '') !== 'Responder') {
    json_response(['success' => false, 'message' => 'Responder access required.'], 403);
  }
  return $user;
}
