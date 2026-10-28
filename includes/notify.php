<?php
if (!function_exists('ensure_responder_notification_table')) {
  function ensure_responder_notification_table(PDO $pdo): bool
  {
    try {
      $exists = (bool) $pdo
        ->query(
          "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='responder_notifications'",
        )
        ->fetchColumn();
      if ($exists) {
        return true;
      }
      $pdo->exec("CREATE TABLE IF NOT EXISTS responder_notifications (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNSIGNED NOT NULL,
            incident_id INT UNSIGNED NULL,
            type VARCHAR(40) NOT NULL DEFAULT 'dispatch',
            title VARCHAR(180) NOT NULL,
            message TEXT NOT NULL,
            read_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_responder_notification_user (user_id, created_at),
            INDEX idx_responder_notification_incident (incident_id),
            CONSTRAINT fk_responder_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            CONSTRAINT fk_responder_notification_incident FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
        ) ENGINE=InnoDB");
      return true;
    } catch (Throwable $e) {
      return false;
    }
  }
}
