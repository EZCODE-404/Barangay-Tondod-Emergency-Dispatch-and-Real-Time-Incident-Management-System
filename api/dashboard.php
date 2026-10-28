<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
require_admin();
$pdo = db();
$stats = [
  'total_incidents' => (int) $pdo->query('SELECT COUNT(*) FROM incidents')->fetchColumn(),
  'active_incidents' => (int) $pdo
    ->query("SELECT COUNT(*) FROM incidents WHERE status IN ('Active','Dispatched','Pending')")
    ->fetchColumn(),
  'responders' => (int) $pdo
    ->query(
      "SELECT COUNT(*) FROM responders WHERE status IN ('Available','On Duty','On Scene','En Route','Standby')",
    )
    ->fetchColumn(),
  'completed' => (int) $pdo
    ->query("SELECT COUNT(*) FROM incidents WHERE status='Resolved'")
    ->fetchColumn(),
  'pending' => (int) $pdo
    ->query("SELECT COUNT(*) FROM incidents WHERE status='Pending'")
    ->fetchColumn(),
];
$rows = $pdo
  ->query('SELECT category,COUNT(*) total FROM incidents GROUP BY category ORDER BY total DESC')
  ->fetchAll();
$tot = max(1, array_sum(array_column($rows, 'total')));
$categories = array_map(
  fn($r) => [
    'category' => $r['category'],
    'total' => (int) $r['total'],
    'percentage' => round(($r['total'] / $tot) * 100),
  ],
  $rows,
);
$map = [];
$q = $pdo->query(
  'SELECT DATE(created_at) day,COUNT(*) total FROM incidents WHERE created_at>=DATE_SUB(CURDATE(),INTERVAL 29 DAY) GROUP BY DATE(created_at) ORDER BY day',
);
foreach ($q as $r) {
  $map[$r['day']] = (int) $r['total'];
}
$labels = [];
$values = [];
for ($i = 29; $i >= 0; $i--) {
  $day = date('Y-m-d', strtotime("-$i day"));
  $labels[] = date('M j', strtotime($day));
  $values[] = $map[$day] ?? 0;
}
$recent = $pdo
  ->query(
    'SELECT i.id,i.incident_no,i.area_id,a.area_name,i.category,i.location,i.status,i.priority,i.created_at,i.source,i.latitude,i.longitude,r.full_name responder_name FROM incidents i LEFT JOIN areas a ON a.id=i.area_id LEFT JOIN responders r ON r.id=i.assigned_responder_id ORDER BY i.created_at DESC LIMIT 20',
  )
  ->fetchAll();
$response = $pdo
  ->query('SELECT r.status AS status,COUNT(*) AS total FROM responders AS r GROUP BY r.status')
  ->fetchAll();
$responders = $pdo
  ->query(
    'SELECT r.id,r.area_id,a.area_name,r.full_name,r.type,r.status,r.phone FROM responders r LEFT JOIN areas a ON a.id=r.area_id ORDER BY r.full_name LIMIT 20',
  )
  ->fetchAll();
$mapIncidents = $pdo
  ->query(
    "SELECT i.id,i.incident_no,i.area_id,a.area_name,i.category,i.location,i.status,i.priority,i.source,i.reporter_name,i.created_at,i.latitude,i.longitude,i.gps_accuracy FROM incidents i LEFT JOIN areas a ON a.id=i.area_id WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL AND i.status NOT IN ('Resolved','Cancelled') ORDER BY i.created_at DESC LIMIT 100",
  )
  ->fetchAll();
json_response([
  'success' => true,
  'stats' => $stats,
  'categories' => $categories,
  'overview' => ['labels' => $labels, 'values' => $values],
  'recent_incidents' => $recent,
  'response_status' => $response,
  'responders' => $responders,
  'map_incidents' => $mapIncidents,
]);
