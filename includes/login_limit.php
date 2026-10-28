<?php
/**
 * Database-backed login throttling.
 * Limits are temporary and scoped to an IP and an IP/username pair so that
 * a third party cannot permanently lock a user's account from another network.
 */
const LOGIN_LIMIT_WINDOW_MINUTES = 15;
const LOGIN_LIMIT_PAIR_MAX = 8;
const LOGIN_LIMIT_IP_MAX = 30;

function login_limit_keys(string $username): array
{
  // REMOTE_ADDR is used deliberately; forwarded headers can be forged unless
  // the deployment explicitly configures a trusted reverse proxy.
  $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
  $normalizedUsername = strtolower(trim($username));

  return [
    [
      'key' => hash('sha256', 'pair:' . $ip . "\0" . $normalizedUsername),
      'limit' => LOGIN_LIMIT_PAIR_MAX,
    ],
    [
      'key' => hash('sha256', 'ip:' . $ip),
      'limit' => LOGIN_LIMIT_IP_MAX,
    ],
  ];
}

/** Return seconds until a block expires, or 0 when the request may proceed. */
function login_limit_retry_after(PDO $pdo, array $keys): int
{
  $select = $pdo->prepare(
    'SELECT attempts, (window_started <= DATE_SUB(NOW(), INTERVAL 15 MINUTE)) AS expired, blocked_until, CASE WHEN blocked_until > NOW() THEN TIMESTAMPDIFF(SECOND, NOW(), blocked_until) ELSE 0 END AS retry_after FROM login_attempt_limits WHERE bucket_key=? LIMIT 1',
  );
  $reset = $pdo->prepare(
    'UPDATE login_attempt_limits SET attempts=0, window_started=NOW(), blocked_until=NULL, updated_at=CURRENT_TIMESTAMP WHERE bucket_key=?',
  );
  $maxRetry = 0;

  foreach ($keys as $item) {
    $select->execute([$item['key']]);
    $row = $select->fetch();
    if (!$row) {
      continue;
    }

    // Honor an active block before considering the attempt window. A block
    // may expire later than the original counting window.
    $retry = (int) ($row['retry_after'] ?? 0);
    if ($retry > 0) {
      $maxRetry = max($maxRetry, $retry);
      continue;
    }

    if ((int) $row['expired'] === 1) {
      // Expired attempts do not count against a new window.
      $reset->execute([$item['key']]);
      continue;
    }

    if ((int) $row['attempts'] >= (int) $item['limit'] && empty($row['blocked_until'])) {
      // Defensive fallback if a row was left at its limit without a block.
      $maxRetry = max($maxRetry, LOGIN_LIMIT_WINDOW_MINUTES * 60);
    }
  }

  return max(0, $maxRetry);
}

/** Record a failed login atomically for each applicable bucket. */
function login_limit_record_failure(PDO $pdo, array $keys): void
{
  $keys = array_values($keys);
  usort($keys, static fn(array $a, array $b): int => strcmp($a['key'], $b['key']));

  $pdo->beginTransaction();
  try {
    $insert = $pdo->prepare(
      'INSERT IGNORE INTO login_attempt_limits (bucket_key, attempts, window_started, blocked_until) VALUES (?, 0, NOW(), NULL)',
    );
    $select = $pdo->prepare(
      'SELECT attempts, (window_started <= DATE_SUB(NOW(), INTERVAL 15 MINUTE)) AS expired FROM login_attempt_limits WHERE bucket_key=? FOR UPDATE',
    );
    $update = $pdo->prepare(
      'UPDATE login_attempt_limits SET attempts=?, window_started=IF(?, NOW(), window_started), blocked_until=IF(? >= ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE), NULL), updated_at=CURRENT_TIMESTAMP WHERE bucket_key=?',
    );

    foreach ($keys as $item) {
      $insert->execute([$item['key']]);
      $select->execute([$item['key']]);
      $row = $select->fetch();
      $attempts = $row ? (int) $row['attempts'] : 0;
      $expired = !$row || (int) $row['expired'] === 1;
      if ($expired) {
        $attempts = 0;
      }

      $attempts++;
      $update->execute([$attempts, $expired ? 1 : 0, $attempts, (int) $item['limit'], $item['key']]);
    }

    $pdo->commit();
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    throw $e;
  }

  // Keep the table bounded without running a cleanup query on every request.
  try {
    if (random_int(1, 100) === 1) {
      $pdo->exec('DELETE FROM login_attempt_limits WHERE updated_at < DATE_SUB(NOW(), INTERVAL 2 DAY)');
    }
  } catch (Throwable $e) {
    // Cleanup is best-effort; throttling must not fail because cleanup did.
    error_log('[Login rate limit cleanup] ' . $e->getMessage());
  }
}

/** Clear only the IP/username pair after a successful login. */
function login_limit_clear_pair(PDO $pdo, array $keys): void
{
  if (!isset($keys[0]['key'])) {
    return;
  }
  $stmt = $pdo->prepare('DELETE FROM login_attempt_limits WHERE bucket_key=?');
  $stmt->execute([$keys[0]['key']]);
}
