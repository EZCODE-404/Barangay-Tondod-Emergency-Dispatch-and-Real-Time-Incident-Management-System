<?php
function archive_old_incidents(PDO $pdo): int
{
  $sql =
    "UPDATE incidents SET archived_at = COALESCE(archived_at, NOW()) WHERE archived_at IS NULL AND created_at < (NOW() - INTERVAL 30 DAY) AND status IN ('Resolved','Cancelled')";
  $pdo->exec($sql);
  return (int) $pdo->query('SELECT ROW_COUNT()')->fetchColumn();
}
