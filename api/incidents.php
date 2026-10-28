<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/archive.php';
require_once __DIR__ . '/../includes/notify.php';
$user = require_admin();
$pdo = db();
archive_old_incidents($pdo);
$m = $_SERVER['REQUEST_METHOD'];
function body()
{
  return request_body();
}
if ($m === 'GET') {
  $id = (int) ($_GET['id'] ?? 0);
  $w = [];
  $p = [];
  if ($id) {
    $w[] = 'i.id=?';
    $p[] = $id;
  }
  if (isset($_GET['search']) && $_GET['search'] !== '') {
    $w[] =
      '(i.incident_no LIKE ? OR i.location LIKE ? OR i.reporter_name LIKE ? OR i.category LIKE ?)';
    $s = '%' . $_GET['search'] . '%';
    array_push($p, $s, $s, $s, $s);
  }
  foreach (['status', 'priority', 'category'] as $f) {
    if (!empty($_GET[$f])) {
      $w[] = "i.$f=?";
      $p[] = $_GET[$f];
    }
  }
  if (($_GET['active'] ?? '') === '1') {
    $w[] = "i.status IN ('Pending','Dispatched','Active')";
  }
  if (($_GET['archived'] ?? '') === '1') {
    $w[] = 'i.archived_at IS NOT NULL';
  }
  if (($_GET['archived'] ?? '') === '0') {
    $w[] = 'i.archived_at IS NULL';
  }
  $sql =
    'SELECT i.*, a.area_name, r.full_name responder_name, i.reporter_phone contact_number FROM incidents i LEFT JOIN areas a ON a.id=i.area_id LEFT JOIN responders r ON r.id=i.assigned_responder_id ' .
    ($w ? 'WHERE ' . implode(' AND ', $w) : '') .
    ' ORDER BY i.created_at DESC LIMIT 500';
  $st = $pdo->prepare($sql);
  $st->execute($p);
  json_response(['success' => true, 'incidents' => $st->fetchAll()]);
}
if ($m === 'POST') {
  $d = body();
  if (($d['action'] ?? '') === 'restore_archive') {
    if (!is_admin_role($user['role'])) {
      json_response(['success' => false, 'message' => 'Administrator access required.'], 403);
    }
    $incidentId = (int) ($d['incident_id'] ?? 0);
    if (!$incidentId) {
      json_response(['success' => false, 'message' => 'Incident ID is required.'], 422);
    }
    $st = $pdo->prepare(
      'UPDATE incidents SET archived_at=NULL, updated_at=NOW() WHERE id=? AND archived_at IS NOT NULL',
    );
    $st->execute([$incidentId]);
    if (!$st->rowCount()) {
      json_response(['success' => false, 'message' => 'Archived incident was not found.'], 404);
    }
    try {
      $pdo
        ->prepare('INSERT INTO incident_logs(incident_id,user_id,action,details) VALUES(?,?,?,?)')
        ->execute([
          $incidentId,
          $user['id'],
          'Archive Restored',
          'Archived incident restored for emergency reference.',
        ]);
    } catch (Throwable $ignore) {
    }
    json_response(['success' => true, 'message' => 'Archived incident restored successfully.']);
  }
  if (($d['action'] ?? '') === 'deploy_all') {
    json_response(
      [
        'success' => false,
        'message' =>
          'Bulk dispatch is disabled. Please dispatch the incident to one selected responder.',
      ],
      409,
    );
  }
  if (($d['action'] ?? '') === 'delete') {
    if (!is_admin_role($user['role'])) {
      json_response(['success' => false, 'message' => 'Administrator access required.'], 403);
    }
    $id = (int) ($d['id'] ?? 0);
    if (!$id) {
      json_response(['success' => false, 'message' => 'Incident ID is required.'], 422);
    }
    try {
      $pdo->beginTransaction();
      $q = $pdo->prepare('SELECT id FROM incidents WHERE id=? LIMIT 1');
      $q->execute([$id]);
      if (!$q->fetch()) {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'Emergency incident was not found.'], 404);
      }
      $tables = $pdo
        ->query(
          "SELECT TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='incidents' AND REFERENCED_COLUMN_NAME='id'",
        )
        ->fetchAll(PDO::FETCH_COLUMN);
      foreach ($tables as $table) {
        if ($table === 'incidents') {
          continue;
        }
        $safe = '`' . str_replace('`', '``', $table) . '`';
        try {
          $pdo->prepare("DELETE FROM $safe WHERE incident_id=?")->execute([$id]);
        } catch (Throwable $ignore) {
        }
      }
      $pdo->prepare('DELETE FROM incidents WHERE id=?')->execute([$id]);
      $pdo->commit();
      json_response([
        'success' => true,
        'message' => 'Emergency incident deleted successfully.',
        'deleted_id' => $id,
      ]);
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }
      error_log('[incidents.php] Delete failed: ' . $e->getMessage());
      json_response(['success' => false, 'message' => 'Delete failed. Please try again.'], 500);
    }
  }
  $cat = $d['category'] ?? 'Others';
  $loc = trim($d['location'] ?? '');
  if ($loc === '') {
    json_response(['success' => false, 'message' => 'Location is required.'], 422);
  }
  $no = 'INC-' . date('Ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
  $source = $d['source'] ?? 'Dashboard';
  $priority = $source === 'SOS' ? 'Critical' : $d['priority'] ?? 'Moderate';
  $phone = $d['reporter_phone'] ?? ($d['contact_number'] ?? '');
  $lat = ($d['latitude'] ?? '') === '' ? null : (float) $d['latitude'];
  $lng = ($d['longitude'] ?? '') === '' ? null : (float) $d['longitude'];
  $accuracy = ($d['gps_accuracy'] ?? '') === '' ? null : (float) $d['gps_accuracy'];
  if (
    ($lat !== null && ($lat < -90 || $lat > 90)) ||
    ($lng !== null && ($lng < -180 || $lng > 180))
  ) {
    json_response(['success' => false, 'message' => 'Invalid GPS coordinates.'], 422);
  }
  if ($accuracy !== null && ($accuracy < 0 || $accuracy > 100000)) {
    $accuracy = null;
  }
  $st = $pdo->prepare(
    "INSERT INTO incidents(incident_no,category,location,description,priority,reporter_name,reporter_phone,reported_by,status,source,latitude,longitude,gps_accuracy) VALUES(?,?,?,?,?,?,?,?, 'Pending',?,?,?,?)",
  );
  $st->execute([
    $no,
    $cat,
    $loc,
    trim($d['description'] ?? ''),
    $priority,
    trim($d['reporter_name'] ?? ''),
    $phone,
    $user['id'],
    $source,
    $lat,
    $lng,
    $accuracy,
  ]);
  $id = (int) $pdo->lastInsertId();
  // Do not broadcast this unassigned incident to responders. The admin dashboard receives
  // incident alerts separately; a responder is notified only after an explicit assignment below.
  json_response(
    [
      'success' => true,
      'message' => 'Incident created.',
      'incident_id' => $id,
      'incident_no' => $no,
      'status' => 'Pending',
      'priority' => $priority,
      'reported_at' => date('Y-m-d H:i:s'),
    ],
    201,
  );
}
if ($m === 'PATCH') {
  $d = body();
  $id = (int) ($d['id'] ?? 0);
  if (!$id) {
    json_response(['success' => false, 'message' => 'Incident ID required.'], 422);
  }
  if (array_key_exists('assigned_responder_id', $d)) {
    $rid = (int) $d['assigned_responder_id'];
    if ($rid <= 0) {
      json_response(['success' => false, 'message' => 'Please select a valid responder.'], 422);
    }
    $pdo->beginTransaction();
    try {
      $hasUserId = (bool) $pdo
        ->query(
          "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='responders' AND column_name='user_id'",
        )
        ->fetchColumn();
      if ($hasUserId) {
        $q = $pdo->prepare(
          'SELECT r.id,r.status,r.full_name,r.user_id,u.role AS account_role,u.status AS account_status FROM responders r LEFT JOIN users u ON u.id=r.user_id WHERE r.id=? FOR UPDATE',
        );
      } else {
        $q = $pdo->prepare('SELECT id,status,full_name FROM responders WHERE id=? FOR UPDATE');
      }
      $q->execute([$rid]);
      $res = $q->fetch();
      if (!$res) {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'Responder not found.'], 404);
      }
      if (!in_array($res['status'], ['Available', 'Standby', 'On Duty'], true)) {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'That responder is not available.'], 409);
      }

      // Resolve exactly one active responder account before dispatch, so a notification
      // cannot accidentally be delivered to a different account with the same name.
      $resUser = 0;
      if ($hasUserId && !empty($res['user_id'])) {
        if (
          strtolower(trim((string) ($res['account_role'] ?? ''))) !== 'responder' ||
          strtolower(trim((string) ($res['account_status'] ?? ''))) !== 'active'
        ) {
          $pdo->rollBack();
          json_response(
            [
              'success' => false,
              'message' =>
                'This responder is not linked to an active responder account. Please fix the responder account before dispatching.',
            ],
            409,
          );
        }
        $resUser = (int) $res['user_id'];
      } else {
        $qUser = $pdo->prepare(
          "SELECT id FROM users WHERE LOWER(TRIM(role))='responder' AND LOWER(TRIM(status))='active' AND LOWER(TRIM(full_name))=LOWER(TRIM(?)) ORDER BY id LIMIT 2",
        );
        $qUser->execute([(string) $res['full_name']]);
        $matches = $qUser->fetchAll(PDO::FETCH_COLUMN);
        if (count($matches) !== 1) {
          $pdo->rollBack();
          json_response(
            [
              'success' => false,
              'message' =>
                'This responder does not have one unique active login account. Link the responder profile to its user account before dispatching.',
            ],
            409,
          );
        }
        $resUser = (int) $matches[0];
      }

      $qIncident = $pdo->prepare(
        'SELECT incident_no,category,location,priority,assigned_responder_id FROM incidents WHERE id=? FOR UPDATE',
      );
      $qIncident->execute([$id]);
      $inc = $qIncident->fetch();
      if (!$inc) {
        $pdo->rollBack();
        json_response(['success' => false, 'message' => 'Incident not found.'], 404);
      }
      $oldRid = (int) ($inc['assigned_responder_id'] ?? 0);
      $pdo
        ->prepare(
          "UPDATE incidents SET assigned_responder_id=?,status='Dispatched',dispatched_at=NOW(),updated_at=NOW() WHERE id=?",
        )
        ->execute([$rid, $id]);
      if ($oldRid > 0 && $oldRid !== $rid) {
        $release = $pdo->prepare(
          "UPDATE responders SET status='Available' WHERE id=? AND NOT EXISTS (SELECT 1 FROM incidents WHERE assigned_responder_id=? AND status IN ('Dispatched','Active'))",
        );
        $release->execute([$oldRid, $oldRid]);
      }
      $pdo->prepare("UPDATE responders SET status='En Route' WHERE id=?")->execute([$rid]);
      $notificationCreated = false;
      try {
        if (ensure_responder_notification_table($pdo)) {
          // Remove duplicate dispatch notifications for this same incident/account before inserting the latest assignment.
          $pdo
            ->prepare(
              "DELETE FROM responder_notifications WHERE incident_id=? AND type='dispatch' AND user_id=?",
            )
            ->execute([$id, $resUser]);
          $msg =
            $inc['category'] . ' at ' . $inc['location'] . ' · Priority: ' . $inc['priority'] . '.';
          $pdo
            ->prepare(
              'INSERT INTO responder_notifications(user_id,incident_id,type,title,message) VALUES(?,?,?,?,?)',
            )
            ->execute([$resUser, $id, 'dispatch', 'NEW EMERGENCY ASSIGNMENT', $msg]);
          $notificationCreated = true;
        }
      } catch (Throwable $notifyError) {
        error_log(
          '[incidents.php] Dispatch notification creation failed: ' . $notifyError->getMessage(),
        );
      }
      try {
        $pdo
          ->prepare('INSERT INTO incident_logs(incident_id,user_id,action,details) VALUES(?,?,?,?)')
          ->execute([$id, $user['id'], 'Dispatched', 'Assigned responder ID ' . $rid]);
      } catch (Throwable $ignore) {
      }
      $pdo->commit();
    } catch (Throwable $e) {
      if ($pdo->inTransaction()) {
        $pdo->rollBack();
      }
      error_log('[incidents.php] Dispatch failed: ' . $e->getMessage());
      json_response(
        [
          'success' => false,
          'message' => 'Dispatch failed. Please check the responder account and try again.',
        ],
        500,
      );
    }
  } elseif (isset($d['status'])) {
    $valid = ['Pending', 'Dispatched', 'Active', 'Resolved', 'Cancelled'];
    $s = $d['status'];
    if (!in_array($s, $valid, true)) {
      json_response(['success' => false, 'message' => 'Invalid status.'], 422);
    }

    if (in_array($s, ['Resolved', 'Cancelled'], true) && !is_admin_role($user['role'])) {
      json_response(
        [
          'success' => false,
          'message' => 'Administrator confirmation is required before this incident can be closed.',
        ],
        403,
      );
    }

    $q = $pdo->prepare('SELECT status,incident_no FROM incidents WHERE id=? LIMIT 1');
    $q->execute([$id]);
    $existing = $q->fetch();
    if (!$existing) {
      json_response(['success' => false, 'message' => 'Incident not found.'], 404);
    }
    $pdo->prepare('UPDATE incidents SET status=?,updated_at=NOW() WHERE id=?')->execute([$s, $id]);
    if (in_array($s, ['Resolved', 'Cancelled'], true)) {
      $pdo
        ->prepare(
          "UPDATE responders r JOIN incidents closed_incident ON closed_incident.assigned_responder_id=r.id SET r.status='Available' WHERE closed_incident.id=? AND NOT EXISTS (SELECT 1 FROM incidents other_incident WHERE other_incident.assigned_responder_id=r.id AND other_incident.id<>closed_incident.id AND other_incident.status IN ('Dispatched','Active'))",
        )
        ->execute([$id]);
      try {
        $pdo
          ->prepare('INSERT INTO incident_logs(incident_id,user_id,action,details) VALUES(?,?,?,?)')
          ->execute([
            $id,
            $user['id'],
            $s === 'Resolved'
              ? 'Administrator Confirmed Resolution'
              : 'Administrator Cancelled Incident',
            'Status changed from ' . $existing['status'] . ' to ' . $s,
          ]);
      } catch (Throwable $ignore) {
      }
    }
  }
  json_response([
    'success' => true,
    'message' => 'Incident updated.',
    'notification_created' => $notificationCreated ?? null,
  ]);
}
if ($m === 'DELETE') {
  if (!is_admin_role($user['role'])) {
    json_response(['success' => false, 'message' => 'Administrator access required.'], 403);
  }
  $id = (int) ($_GET['id'] ?? 0);
  if (!$id) {
    $bd = body();
    $id = (int) ($bd['id'] ?? 0);
  }
  if (!$id) {
    json_response(['success' => false, 'message' => 'Incident ID is required.'], 422);
  }
  try {
    $pdo->beginTransaction();
    $q = $pdo->prepare('SELECT id FROM incidents WHERE id=? LIMIT 1');
    $q->execute([$id]);
    if (!$q->fetch()) {
      $pdo->rollBack();
      json_response(['success' => false, 'message' => 'Emergency incident was not found.'], 404);
    }
    $tables = $pdo
      ->query(
        "SELECT TABLE_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME='incidents' AND REFERENCED_COLUMN_NAME='id'",
      )
      ->fetchAll(PDO::FETCH_COLUMN);
    foreach ($tables as $table) {
      if ($table === 'incidents') {
        continue;
      }
      $safe = '`' . str_replace('`', '``', $table) . '`';
      try {
        $pdo->prepare("DELETE FROM $safe WHERE incident_id=?")->execute([$id]);
      } catch (Throwable $ignore) {
      }
    }
    $pdo->prepare('DELETE FROM incidents WHERE id=?')->execute([$id]);
    $pdo->commit();
    json_response([
      'success' => true,
      'message' => 'Emergency incident deleted successfully.',
      'deleted_id' => $id,
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    error_log('[incidents.php] Delete failed: ' . $e->getMessage());
    json_response(['success' => false, 'message' => 'Delete failed. Please try again.'], 500);
  }
}
json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
