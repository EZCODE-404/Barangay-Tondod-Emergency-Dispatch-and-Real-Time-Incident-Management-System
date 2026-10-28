<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
$user = require_admin();
$pdo = db();
$m = $_SERVER['REQUEST_METHOD'];
$hasUserId = (bool) $pdo
  ->query(
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='responders' AND column_name='user_id'",
  )
  ->fetchColumn();
$hasProfilePicture = (bool) $pdo
  ->query(
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='profile_picture'",
  )
  ->fetchColumn();
$hasDevices = (bool) $pdo
  ->query(
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='responder_devices'",
  )
  ->fetchColumn();
if ($m === 'GET') {
  $where = [];
  $p = [];
  if (!empty($_GET['search'])) {
    $where[] = '(r.full_name LIKE ? OR r.type LIKE ? OR r.phone LIKE ?)';
    $s = '%' . $_GET['search'] . '%';
    array_push($p, $s, $s, $s);
  }
  if (!empty($_GET['status'])) {
    $where[] = 'r.status=?';
    $p[] = $_GET['status'];
  }
  $profileJoin = $hasUserId && $hasProfilePicture ? ',u.profile_picture' : '';
  $join = $hasUserId && $hasProfilePicture ? ' LEFT JOIN users u ON u.id=r.user_id' : '';
  $st = $pdo->prepare(
    'SELECT r.id,r.area_id,a.area_name,r.full_name,r.type,r.phone,r.status,r.created_at' .
      ($hasUserId ? ',r.user_id' : '') .
      $profileJoin .
      ($hasDevices
        ? ', (SELECT COUNT(*) FROM responder_devices rd WHERE rd.user_id=r.user_id AND rd.active=1) AS registered_devices, (SELECT MAX(rd.last_seen) FROM responder_devices rd WHERE rd.user_id=r.user_id) AS last_device_seen'
        : '') .
      ' FROM responders r LEFT JOIN areas a ON a.id=r.area_id ' .
      $join .
      ' ' .
      ($where ? 'WHERE ' . implode(' AND ', $where) : '') .
      ' ORDER BY r.full_name',
  );
  $st->execute($p);
  json_response(['success' => true, 'responders' => $st->fetchAll()]);
}
$d = request_body();
if ($m === 'POST') {
  $name = trim((string) ($d['full_name'] ?? ''));
  $type = trim((string) ($d['type'] ?? 'General Responder'));
  $phone = trim((string) ($d['phone'] ?? ''));
  $status = (string) ($d['status'] ?? 'Available');
  if ($name === '' || strlen($name) > 120) {
    json_response(['success' => false, 'message' => 'A valid responder name is required.'], 422);
  }
  if (
    !in_array(
      $status,
      ['Available', 'On Duty', 'On Scene', 'En Route', 'Standby', 'Unavailable'],
      true,
    )
  ) {
    json_response(['success' => false, 'message' => 'Invalid responder status.'], 422);
  }
  $st = $pdo->prepare('INSERT INTO responders(full_name,type,phone,status) VALUES(?,?,?,?)');
  $st->execute([$name, $type !== '' ? $type : 'General Responder', $phone, $status]);
  json_response(
    ['success' => true, 'message' => 'Responder created.', 'id' => (int) $pdo->lastInsertId()],
    201,
  );
}
if ($m === 'PATCH') {
  $id = (int) ($d['id'] ?? 0);
  if (!$id) {
    json_response(['success' => false, 'message' => 'Responder ID is required.'], 422);
  }
  $name = trim((string) ($d['full_name'] ?? ''));
  $type = trim((string) ($d['type'] ?? 'General Responder'));
  $phone = trim((string) ($d['phone'] ?? ''));
  $status = (string) ($d['status'] ?? 'Available');
  if ($name === '' || strlen($name) > 120) {
    json_response(['success' => false, 'message' => 'A valid responder name is required.'], 422);
  }
  if (
    !in_array(
      $status,
      ['Available', 'On Duty', 'On Scene', 'En Route', 'Standby', 'Unavailable'],
      true,
    )
  ) {
    json_response(['success' => false, 'message' => 'Invalid responder status.'], 422);
  }
  $st = $pdo->prepare('UPDATE responders SET full_name=?,type=?,phone=?,status=? WHERE id=?');
  $st->execute([$name, $type !== '' ? $type : 'General Responder', $phone, $status, $id]);
  if ($st->rowCount() === 0) {
    $q = $pdo->prepare('SELECT id FROM responders WHERE id=?');
    $q->execute([$id]);
    if (!$q->fetch()) {
      json_response(['success' => false, 'message' => 'Responder not found.'], 404);
    }
  }
  json_response(['success' => true, 'message' => 'Responder updated.']);
}
if ($m === 'DELETE') {
  if (normalize_role_label($user['role']) !== 'Super Admin') {
    json_response(
      ['success' => false, 'message' => 'Only the Super Admin can delete responders.'],
      403,
    );
  }
  $id = (int) ($_GET['id'] ?? 0);
  if (!$id) {
    json_response(['success' => false, 'message' => 'Responder ID is required.'], 422);
  }
  $st = $pdo->prepare('DELETE FROM responders WHERE id=?');
  $st->execute([$id]);
  if ($st->rowCount() === 0) {
    json_response(['success' => false, 'message' => 'Responder not found.'], 404);
  }
  json_response(['success' => true, 'message' => 'Responder deleted.']);
}
json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
