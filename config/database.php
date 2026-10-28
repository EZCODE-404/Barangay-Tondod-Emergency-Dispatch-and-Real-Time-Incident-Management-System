<?php
require_once __DIR__ . '/config.php';

function db(): PDO
{
  static $pdo = null;
  if ($pdo instanceof PDO) {
    return $pdo;
  }

  $host = getenv('DB_HOST') ?: DB_HOST;
  $name = getenv('DB_NAME') ?: DB_NAME;
  $user = getenv('DB_USER') ?: DB_USER;
  $pass = getenv('DB_PASS') ?: DB_PASS;
  $port = (int) (getenv('DB_PORT') ?: DB_PORT);

  if ($host === '' || $name === '' || $user === '') {
    throw new RuntimeException(
      'Cloud database is not configured. Set DB_HOST, DB_NAME, DB_USER and DB_PASS on the server.',
    );
  }

  $dsn = 'mysql:host=' . $host . ';port=' . $port . ';dbname=' . $name . ';charset=utf8mb4';

  try {
    $pdo = new PDO($dsn, $user, $pass, [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
  } catch (PDOException $e) {
    error_log('[Database] Connection failed: ' . $e->getMessage());
    throw new RuntimeException(
      'Database connection failed. Check the server database configuration.',
    );
  }
}
