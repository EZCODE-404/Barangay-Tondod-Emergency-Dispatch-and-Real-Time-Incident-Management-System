<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
$u = require_responder();
$pdo = db();
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
if ($hasUserId) {
  $sql =
    'SELECT r.id,r.full_name,r.type,r.phone,r.status' .
    ($hasProfilePicture ? ',u.profile_picture' : '') .
    ' FROM responders r' .
    ($hasProfilePicture ? ' LEFT JOIN users u ON u.id=r.user_id' : '') .
    ' WHERE r.user_id=? LIMIT 1';
  $st = $pdo->prepare($sql);
  $st->execute([$u['id']]);
  $r = $st->fetch();
} else {
  $st = $pdo->prepare(
    'SELECT id,full_name,type,phone,status FROM responders WHERE LOWER(TRIM(full_name))=LOWER(TRIM(?)) LIMIT 1',
  );
  $st->execute([$u['full_name']]);
  $r = $st->fetch();
  if ($r && $hasProfilePicture) {
    $q = $pdo->prepare('SELECT profile_picture FROM users WHERE id=? LIMIT 1');
    $q->execute([$u['id']]);
    $r['profile_picture'] = $q->fetchColumn() ?: null;
  }
}
if (!$r && $hasUserId) {
  $st = $pdo->prepare(
    'SELECT id,full_name,type,phone,status FROM responders WHERE LOWER(TRIM(full_name))=LOWER(TRIM(?)) AND user_id IS NULL LIMIT 1',
  );
  $st->execute([$u['full_name']]);
  $r = $st->fetch();
  if ($r) {
    $pdo->prepare('UPDATE responders SET user_id=? WHERE id=?')->execute([$u['id'], $r['id']]);
  }
}
if (!$r) {
  json_response(
    [
      'success' => false,
      'message' =>
        'Responder profile is not linked to this account. Ask the Super Admin to approve your registration.',
    ],
    404,
  );
}
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $st = $pdo->prepare(
    "SELECT i.id,i.incident_no,i.category,i.location,i.description,i.priority,i.status,i.created_at,i.updated_at,i.latitude,i.longitude,i.source,i.image_path,i.reporter_name,i.reporter_phone,i.assigned_responder_id FROM incidents i WHERE i.assigned_responder_id=? AND i.status NOT IN ('Resolved','Cancelled') ORDER BY CASE i.status WHEN 'Dispatched' THEN 1 WHEN 'Active' THEN 2 WHEN 'Pending' THEN 3 ELSE 4 END,i.created_at DESC",
  );
  $st->execute([$r['id']]);
  json_response(['success' => true, 'responder' => $r, 'incidents' => $st->fetchAll()]);
}
if ($_SERVER['REQUEST_METHOD'] === 'PATCH') {
  $d = request_body();
  $status = (string) ($d['status'] ?? '');
  $valid = ['Available', 'En Route', 'On Scene', 'Standby', 'Unavailable'];
  if (!in_array($status, $valid, true)) {
    json_response(['success' => false, 'message' => 'Invalid responder status.'], 422);
  }
  $incidentId = (int) ($d['incident_id'] ?? 0);
  $activeCheck = $pdo->prepare(
    "SELECT COUNT(*) FROM incidents WHERE assigned_responder_id=? AND status IN ('Dispatched','Active')",
  );
  $activeCheck->execute([(int) $r['id']]);
  $hasActive = (int) $activeCheck->fetchColumn() > 0;
  if ($hasActive && in_array($status, ['Available', 'Standby', 'Unavailable'], true)) {
    json_response(
      [
        'success' => false,
        'message' =>
          'You still have an active assigned incident. Update the incident status or ask the administrator to close/reassign it first.',
      ],
      409,
    );
  }
  if (in_array($status, ['En Route', 'On Scene'], true) && $incidentId > 0) {
    $newIncidentStatus = $status === 'On Scene' ? 'Active' : 'Dispatched';
    $pdo->beginTransaction();
    try {
      $q = $pdo->prepare(
        "UPDATE incidents SET status=?,updated_at=NOW() WHERE id=? AND assigned_responder_id=? AND status NOT IN ('Resolved','Cancelled')",
      );
      $q->execute([$newIncidentStatus, $incidentId, (int) $r['id']]);
      if ($q->rowCount() === 0) {
        $check = $pdo->prepare(
          'SELECT id FROM incidents WHERE id=? AND assigned_responder_id=? AND status=? LIMIT 1',
        );
        $check->execute([$incidentId, (int) $r['id'], $newIncidentStatus]);
        if (!$check->fetch()) {
          $pdo->rollBack();
          json_response(
            [
              'success' => false,
              'message' =>
                'That incident is not assigned to your responder account or is already closed.',
            ],
            403,
          );
        }
      }
      $pdo
        ->prepare('UPDATE responders SET status=? WHERE id=?')
        ->execute([$status, (int) $r['id']]);
      $pdo->commit();
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }
      error_log('[responder.php] Responder status update failed: ' . $e->getMessage());
      json_response(
        [
          'success' => false,
          'message' => 'Responder status could not be updated. Please try again.',
        ],
        500,
      );
    }
  } else {
    $pdo->prepare('UPDATE responders SET status=? WHERE id=?')->execute([$status, (int) $r['id']]);
  }
  json_response(['success' => true, 'message' => 'Responder status updated.']);
}
json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
