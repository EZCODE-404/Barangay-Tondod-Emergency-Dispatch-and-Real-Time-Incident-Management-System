<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';

$isPublic = isset($_GET['public']) && $_GET['public'] === '1';
if (!$isPublic) {
  require_admin();
}
$pdo = db();
$afterId = max(0, (int) ($_GET['after_id'] ?? 0));

if ($isPublic) {
  $base =
    "SELECT i.id,i.incident_no,i.category,i.location,i.priority,i.status,i.created_at,i.source,
" .
    "CASE WHEN i.assigned_responder_id IS NULL THEN NULL ELSE 'Responder Assigned' END AS responder_name
" .
    "FROM incidents i WHERE i.status NOT IN ('Resolved','Cancelled')";
  if ($afterId === 0) {
    // Initial public load should show the newest active reports, rather than
    // the first 50 ever created. Reverse back to ascending order for polling.
    $stmt = $pdo->query($base . ' ORDER BY i.id DESC LIMIT 50');
    $rows = array_reverse($stmt->fetchAll());
  } else {
    $stmt = $pdo->prepare($base . ' AND i.id>? ORDER BY i.id ASC LIMIT 50');
    $stmt->execute([$afterId]);
    $rows = $stmt->fetchAll();
  }
} else {
  $columns =
    "SELECT i.id,i.incident_no,i.category,i.location,i.priority,i.status,i.created_at,i.source,
" .
    "i.latitude,i.longitude,i.assigned_responder_id,r.full_name AS responder_name
" .
    'FROM incidents i LEFT JOIN responders r ON r.id=i.assigned_responder_id ';
  if ($afterId === 0) {
    $stmt = $pdo->query(
      $columns . "WHERE i.status NOT IN ('Resolved','Cancelled') ORDER BY i.id DESC LIMIT 50",
    );
    $rows = array_reverse($stmt->fetchAll());
  } else {
    $stmt = $pdo->prepare(
      $columns .
        "WHERE i.id>? AND i.status NOT IN ('Resolved','Cancelled') ORDER BY i.id ASC LIMIT 50",
    );
    $stmt->execute([$afterId]);
    $rows = $stmt->fetchAll();
  }
}
$max = $afterId;
foreach ($rows as $row) {
  $max = max($max, (int) $row['id']);
}
if ($max === $afterId) {
  $max = (int) $pdo->query('SELECT COALESCE(MAX(id),0) FROM incidents')->fetchColumn();
}
json_response([
  'success' => true,
  'incidents' => $rows,
  'last_id' => $max,
  'server_time' => date('Y-m-d H:i:s'),
]);
