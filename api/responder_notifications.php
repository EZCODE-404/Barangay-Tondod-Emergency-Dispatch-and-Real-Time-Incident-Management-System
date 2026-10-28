<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/notify.php';

$u = require_responder();

$pdo = db();
ensure_responder_notification_table($pdo);
$m = $_SERVER['REQUEST_METHOD'];

try {
  if ($m === 'GET') {
    $afterId = max(0, (int) ($_GET['after_id'] ?? 0));
    $userId = (int) $u['id'];
    $fullName = (string) ($u['full_name'] ?? '');
    $hasResponderUserId = (bool) $pdo
      ->query(
        "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='responders' AND column_name='user_id'",
      )
      ->fetchColumn();

    // Older databases may have responder profiles not linked by user_id yet; use the same
    // name fallback as api/responder.php, but always require the incident's current assignee.
    $assignmentJoin = $hasResponderUserId
      ? 'JOIN responders r ON r.id=i.assigned_responder_id AND (r.user_id=? OR (r.user_id IS NULL AND LOWER(TRIM(r.full_name))=LOWER(TRIM(?))))'
      : 'JOIN responders r ON r.id=i.assigned_responder_id AND LOWER(TRIM(r.full_name))=LOWER(TRIM(?))';
    $assignmentParams = $hasResponderUserId ? [$userId, $fullName] : [$fullName];
    $from = "FROM responder_notifications n INNER JOIN incidents i ON i.id=n.incident_id $assignmentJoin";
    // Only actual one-to-one dispatch notifications are shown. This also hides old
    // broadcast notifications created by earlier versions of the application.
    $visibility = "n.user_id=? AND n.type='dispatch' AND i.status NOT IN ('Resolved','Cancelled')";
    $visibilityParams = array_merge($assignmentParams, [$userId]);

    $st = $pdo->prepare("SELECT n.id,n.incident_id,n.type,n.title,n.message,n.read_at,n.created_at,
                   i.incident_no,i.category,i.location,i.priority,i.status,
                   i.latitude,i.longitude
            $from
            WHERE $visibility AND n.id>?
            ORDER BY n.id ASC
            LIMIT 100");
    $st->execute(array_merge($visibilityParams, [$afterId]));
    $rows = $st->fetchAll();

    $q = $pdo->prepare("SELECT COALESCE(MAX(n.id),0) $from WHERE $visibility");
    $q->execute($visibilityParams);
    $max = (int) $q->fetchColumn();

    $unread = $pdo->prepare("SELECT COUNT(*) $from WHERE $visibility AND n.read_at IS NULL");
    $unread->execute($visibilityParams);

    json_response([
      'success' => true,
      'notifications' => $rows,
      'unread' => (int) $unread->fetchColumn(),
      'last_id' => $max,
      'server_time' => date('Y-m-d H:i:s'),
    ]);
  }

  if ($m === 'PATCH') {
    $d = request_body();
    $id = (int) ($d['id'] ?? 0);
    if (!$id) {
      json_response(['success' => false, 'message' => 'Notification ID is required.'], 422);
    }

    $st = $pdo->prepare(
      'UPDATE responder_notifications SET read_at=NOW() WHERE id=? AND user_id=?',
    );
    $st->execute([$id, (int) $u['id']]);

    json_response(['success' => true, 'message' => 'Notification marked as read.']);
  }
} catch (Throwable $e) {
  json_response(
    [
      'success' => false,
      'message' => 'Responder notification database migration is required.',
    ],
    500,
  );
}

json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
