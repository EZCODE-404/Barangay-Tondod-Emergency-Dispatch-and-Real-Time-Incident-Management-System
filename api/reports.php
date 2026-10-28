<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/archive.php';
require_admin();
$pdo = db();

$from = $_GET['from'] ?? date('Y-m-01');
$to = $_GET['to'] ?? date('Y-m-d');
$f = DateTime::createFromFormat('Y-m-d', $from);
$t = DateTime::createFromFormat('Y-m-d', $to);
if (!$f || !$t || $f > $t) {
  json_response(['success' => false, 'message' => 'Invalid reporting date range.'], 422);
}

$days = (int) $f->diff($t)->format('%a') + 1;
if ($days <= 62) {
  $granularity = 'daily';
  $trendSql =
    'SELECT DATE(created_at) period,COUNT(*) total FROM incidents WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY DATE(created_at) ORDER BY period';
} elseif ($days <= 366) {
  $granularity = 'monthly';
  $trendSql =
    "SELECT DATE_FORMAT(created_at,'%Y-%m') period,COUNT(*) total FROM incidents WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY DATE_FORMAT(created_at,'%Y-%m') ORDER BY period";
} else {
  $granularity = 'yearly';
  $trendSql =
    'SELECT YEAR(created_at) period,COUNT(*) total FROM incidents WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY YEAR(created_at) ORDER BY period';
}

$q = $pdo->prepare(
  "SELECT COUNT(*) AS total,SUM(i.status='Resolved') AS resolved,SUM(i.status IN ('Pending','Dispatched','Active')) AS active,SUM(i.status='Cancelled') AS cancelled,SUM(i.priority='Critical') AS critical FROM incidents AS i WHERE DATE(i.created_at) BETWEEN ? AND ?",
);
$q->execute([$from, $to]);
$summary = $q->fetch();

$q = $pdo->prepare(
  'SELECT category,COUNT(*) total FROM incidents WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY category ORDER BY total DESC',
);
$q->execute([$from, $to]);
$categories = $q->fetchAll();
$q = $pdo->prepare(
  'SELECT i.status AS status,COUNT(*) AS total FROM incidents AS i WHERE DATE(i.created_at) BETWEEN ? AND ? GROUP BY i.status ORDER BY total DESC',
);
$q->execute([$from, $to]);
$statuses = $q->fetchAll();
$q = $pdo->prepare($trendSql);
$q->execute([$from, $to]);
$trend = $q->fetchAll();
$q = $pdo->prepare(
  "SELECT i.incident_no,i.area_id,a.area_name,i.category,i.location,i.priority,i.status,i.created_at,COALESCE(r.full_name,'') responder_name FROM incidents i LEFT JOIN areas a ON a.id=i.area_id LEFT JOIN responders r ON r.id=i.assigned_responder_id WHERE DATE(i.created_at) BETWEEN ? AND ? ORDER BY i.created_at ASC,i.id ASC",
);
$q->execute([$from, $to]);
$incidents = $q->fetchAll();

json_response([
  'success' => true,
  'summary' => $summary,
  'categories' => $categories,
  'statuses' => $statuses,
  'daily' => $trend,
  'trend' => $trend,
  'granularity' => $granularity,
  'days' => $days,
  'incidents' => $incidents,
  'from' => $from,
  'to' => $to,
]);
