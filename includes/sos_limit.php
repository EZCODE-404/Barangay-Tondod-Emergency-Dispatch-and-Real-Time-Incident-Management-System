<?php
const SOS_MAX_REPORTS = 2;
// Secondary abuse ceiling per source IP. Deliberately much higher than the
// per-browser limit to reduce the chance of blocking several residents sharing Wi-Fi.
const SOS_IP_MAX_REPORTS = 100;

function ensure_bystander_client_key(): string
{
  $cookieName = 'bt_sos_client_id';
  $value = isset($_COOKIE[$cookieName]) ? trim((string) $_COOKIE[$cookieName]) : '';
  if (!preg_match('/^[a-f0-9]{48}$/', $value)) {
    $value = bin2hex(random_bytes(24));
    setcookie($cookieName, $value, [
      'expires' => time() + 10 * 365 * 24 * 60 * 60,
      'path' => '/',
      'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
      'httponly' => true,
      'samesite' => 'Lax',
    ]);
    $_COOKIE[$cookieName] = $value;
  }
  return 'bystander:' . $value;
}

function sos_client_key(?array $user = null): string
{
  if ($user) {
    $role = strtolower(trim((string) ($user['role'] ?? '')));
    if ($role === 'responder') {
      return 'responder:' . (int) $user['id'];
    }
    if ($role === 'bystander') {
      return 'bystander-user:' . (int) $user['id'];
    }
  }
  return ensure_bystander_client_key();
}

/** Return the existing per-client key and, for public reports, a server-derived IP key. */
function sos_client_keys(?array $user = null): array
{
  if ($user) {
    $role = strtolower(trim((string) ($user['role'] ?? '')));
    if ($role === 'responder') {
      return ['responder:' . (int) $user['id']];
    }
    if ($role === 'bystander') {
      return ['bystander-user:' . (int) $user['id']];
    }
  }
  $cookieKey = sos_client_key(null);
  $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
  // Hash the source IP before persisting it; do not store raw IP addresses in the limiter table.
  $ipKey = 'bystander-ip:' . substr(hash('sha256', $ip), 0, 40);
  return [$cookieKey, $ipKey];
}

function get_sos_report_count(PDO $pdo, $clientKey): int
{
  $keys = is_array($clientKey) ? array_values($clientKey) : [$clientKey];
  if (!$keys) {
    return 0;
  }
  // The UI's visible daily counter remains the per-browser/account count (first key).
  $st = $pdo->prepare(
    'SELECT report_count FROM sos_report_limits WHERE client_key=? AND report_date=CURRENT_DATE LIMIT 1',
  );
  $st->execute([(string) $keys[0]]);
  $row = $st->fetch();
  return $row ? (int) $row['report_count'] : 0;
}

function begin_sos_report_slot(PDO $pdo, $clientKey)
{
  $keys = is_array($clientKey) ? array_values(array_unique($clientKey)) : [$clientKey];
  if (!$keys) {
    throw new InvalidArgumentException('At least one SOS client key is required.');
  }
  $pdo->beginTransaction();
  try {
    $ins = $pdo->prepare(
      'INSERT IGNORE INTO sos_report_limits(client_key,report_date,report_count) VALUES(?,CURRENT_DATE,0)',
    );
    $sel = $pdo->prepare(
      'SELECT report_count FROM sos_report_limits WHERE client_key=? AND report_date=CURRENT_DATE FOR UPDATE',
    );
    $counts = [];
    foreach ($keys as $key) {
      $ins->execute([$key]);
      $sel->execute([$key]);
      $row = $sel->fetch();
      $counts[(string) $key] = $row ? (int) $row['report_count'] : 0;
    }
    foreach ($counts as $key => $count) {
      $limit = str_starts_with($key, 'bystander-ip:') ? SOS_IP_MAX_REPORTS : SOS_MAX_REPORTS;
      if ($count >= $limit) {
        $pdo->rollBack();
        return false;
      }
    }
    $up = $pdo->prepare(
      'UPDATE sos_report_limits SET report_count=?,updated_at=CURRENT_TIMESTAMP WHERE client_key=? AND report_date=CURRENT_DATE',
    );
    $primaryCount = 0;
    foreach ($counts as $key => $count) {
      $next = $count + 1;
      $up->execute([$next, $key]);
      if ($key === (string) $keys[0]) {
        $primaryCount = $next;
      }
    }
    return $primaryCount;
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    throw $e;
  }
}

/** Backward-compatible helper for non-incident callers. */
function consume_sos_report_slot(PDO $pdo, string $clientKey)
{
  $newCount = begin_sos_report_slot($pdo, $clientKey);
  if ($newCount === false) {
    return false;
  }
  $pdo->commit();
  return $newCount;
}
