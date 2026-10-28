<?php

/**
 * Local configuration template.
 * Copy this file to config.php and set the local values there.
 * Never commit config.php or real database credentials.
 */

const DB_HOST = '127.0.0.1';
const DB_NAME = 'tondod_emergency';
const DB_USER = 'replace_with_database_user';
const DB_PASS = 'replace_with_database_password';
const DB_PORT = 3306;
const DB_SSL_CA = '';

const FRONTEND_URL = 'http://localhost';

const PROTECTED_SUPERADMIN_USERNAMES = [
  'replace_with_first_superadmin',
];

date_default_timezone_set('Asia/Manila');

$https = !empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off';

if (!$https && isset($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
  $https = strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https';
}

ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_path', '/');
ini_set('session.cookie_samesite', 'Lax');
ini_set('session.cookie_secure', $https ? '1' : '0');
ini_set('session.use_cookies', '1');
ini_set('session.use_only_cookies', '1');
ini_set('session.use_strict_mode', '1');

if (session_status() === PHP_SESSION_NONE) {
  session_start();
}
