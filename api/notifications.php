<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';

$u = require_admin();

$pdo = db();

$afterId = max(0, (int) ($_GET['after_id'] ?? 0));

$st = $pdo->prepare("
    SELECT i.id,i.incident_no,i.category,i.location,i.priority,i.status,
           i.reporter_name,i.created_at,i.source,i.latitude,i.longitude
    FROM incidents AS i
    WHERE i.status IN ('Pending','Dispatched','Active') AND (?=0 OR i.id>?)
    ORDER BY i.id ASC
    LIMIT 50
");
$st->execute([$afterId, $afterId]);
$rows = $st->fetchAll();

$count = (int) $pdo->query("SELECT COUNT(*) FROM incidents WHERE status='Pending'")->fetchColumn();
$lastId = (int) $pdo->query('SELECT COALESCE(MAX(id),0) FROM incidents')->fetchColumn();

json_response([
  'success' => true,
  'notifications' => $rows,
  'count' => $count,
  'unread_count' => $count,
  'last_id' => $lastId,
  'server_time' => date('Y-m-d H:i:s'),
]);
