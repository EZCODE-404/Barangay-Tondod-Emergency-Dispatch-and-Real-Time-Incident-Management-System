<?php
if (!defined('JSON_API')) {
  define('JSON_API', true);
}
require_once __DIR__ . '/../includes/auth.php';
require_once __DIR__ . '/../includes/profile_picture.php';
$user = require_admin();

$pdo = db();
$m = $_SERVER['REQUEST_METHOD'];
$hasUserId = (bool) $pdo
  ->query(
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='responders' AND column_name='user_id'",
  )
  ->fetchColumn();
$protectedUsernames = PROTECTED_SUPERADMIN_USERNAMES;
$hasProfilePicture = (bool) $pdo
  ->query(
    "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='users' AND column_name='profile_picture'",
  )
  ->fetchColumn();
if ($m === 'GET') {
  $profileSelect = $hasProfilePicture ? ',u.profile_picture' : '';
  $sql = $hasUserId
    ? "SELECT u.id,u.username,u.full_name,u.role,u.status,u.created_at{$profileSelect},r.type AS responder_type,r.phone AS responder_phone FROM users u LEFT JOIN responders r ON r.user_id=u.id WHERE u.role IN ('Super Admin','Administrator','Responder') AND u.username NOT IN ('JhayBorja28','DragonBall123','Dylanoex','MementoMori25','superadmin') ORDER BY CASE u.role WHEN 'Super Admin' THEN 1 WHEN 'Administrator' THEN 2 WHEN 'Responder' THEN 3 ELSE 4 END, u.full_name"
    : "SELECT u.id,u.username,u.full_name,u.role,u.status,u.created_at{$profileSelect},NULL AS responder_type,NULL AS responder_phone FROM users u WHERE u.role IN ('Super Admin','Administrator','Responder') AND u.username NOT IN ('JhayBorja28','DragonBall123','Dylanoex','MementoMori25','superadmin') ORDER BY CASE u.role WHEN 'Super Admin' THEN 1 WHEN 'Administrator' THEN 2 WHEN 'Responder' THEN 3 ELSE 4 END, u.full_name";
  $rows = $pdo->query($sql)->fetchAll();
  if (!$hasUserId) {
    foreach ($rows as &$row) {
      if ($row['role'] === 'Responder') {
        $q = $pdo->prepare(
          'SELECT type,phone FROM responders WHERE full_name=? ORDER BY id DESC LIMIT 1',
        );
        $q->execute([$row['full_name']]);
        $r = $q->fetch();
        $row['responder_type'] = $r['type'] ?? null;
        $row['responder_phone'] = $r['phone'] ?? null;
      }
    }
    unset($row);
  }
  foreach ($rows as &$row) {
    $row['type'] = $row['responder_type'];
    $row['phone'] = $row['responder_phone'];
  }
  unset($row);
  json_response(['success' => true, 'users' => $rows]);
}
if ($m === 'POST') {
  $d = request_body();
  $u = trim((string) ($d['username'] ?? ''));
  $n = trim((string) ($d['full_name'] ?? ''));
  $pw = (string) ($d['password'] ?? '');
  $cpw = (string) ($d['confirm_password'] ?? '');
  $r = (string) ($d['role'] ?? 'Responder');
  $stt = $d['status'] ?? 'active';
  $roles = ['Administrator', 'Responder'];
  if ($u === '' || $n === '' || strlen($pw) < 6) {
    json_response(
      [
        'success' => false,
        'message' => 'Complete all fields; password must be at least 6 characters.',
      ],
      422,
    );
  }
  if ($pw !== $cpw) {
    json_response(
      ['success' => false, 'message' => 'Password and Confirm Password do not match.'],
      422,
    );
  }
  if (!in_array($r, $roles, true) || !in_array($stt, ['active', 'inactive'], true)) {
    json_response(['success' => false, 'message' => 'Invalid role or status.'], 422);
  }
  $profile = validate_profile_picture($d['profile_picture'] ?? null);
  try {
    $pdo->beginTransaction();
    if ($hasProfilePicture) {
      $pdo
        ->prepare(
          'INSERT INTO users(username,password_hash,full_name,role,status,profile_picture) VALUES(?,?,?,?,?,?)',
        )
        ->execute([$u, password_hash($pw, PASSWORD_DEFAULT), $n, $r, $stt, $profile]);
    } else {
      $pdo
        ->prepare(
          'INSERT INTO users(username,password_hash,full_name,role,status) VALUES(?,?,?,?,?)',
        )
        ->execute([$u, password_hash($pw, PASSWORD_DEFAULT), $n, $r, $stt]);
    }
    $uid = (int) $pdo->lastInsertId();
    if ($r === 'Responder') {
      if ($hasUserId) {
        $pdo
          ->prepare('INSERT INTO responders(user_id,full_name,type,phone,status) VALUES(?,?,?,?,?)')
          ->execute([
            $uid,
            $n,
            'General Responder',
            $d['phone'] ?? '',
            $stt === 'active' ? 'Available' : 'Unavailable',
          ]);
      } else {
        $pdo
          ->prepare('INSERT INTO responders(full_name,type,phone,status) VALUES(?,?,?,?)')
          ->execute([
            $n,
            'General Responder',
            $d['phone'] ?? '',
            $stt === 'active' ? 'Available' : 'Unavailable',
          ]);
      }
    }
    $pdo->commit();
    json_response(
      ['success' => true, 'message' => 'Account created successfully.', 'user_id' => $uid],
      201,
    );
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    json_response(
      ['success' => false, 'message' => 'Username already exists or account could not be created.'],
      409,
    );
  }
}
if ($m === 'PATCH') {
  $d = request_body();
  $id = (int) ($d['id'] ?? 0);
  if (!$id) {
    json_response(['success' => false, 'message' => 'User ID is required.'], 422);
  }
  $q = $pdo->prepare('SELECT * FROM users WHERE id=?');
  $q->execute([$id]);
  $target = $q->fetch();
  if (!$target) {
    json_response(['success' => false, 'message' => 'User not found.'], 404);
  }
  if (
    normalize_role_label($target['role']) === 'Super Admin' ||
    in_array(
      strtolower((string) $target['username']),
      array_map('strtolower', PROTECTED_SUPERADMIN_USERNAMES),
      true,
    )
  ) {
    json_response(
      [
        'success' => false,
        'message' => 'This protected Super Admin account cannot be edited or approved here.',
      ],
      403,
    );
  }
  $newRole = (string) ($d['role'] ?? $target['role']);
  $newStatus = strtolower((string) ($d['status'] ?? $target['status']));
  if (array_key_exists('password', $d) && trim((string) $d['password']) !== '') {
    $newPassword = (string) $d['password'];
    $confirmPassword = (string) ($d['confirm_password'] ?? '');
    if (strlen($newPassword) < 6) {
      json_response(
        ['success' => false, 'message' => 'Password must be at least 6 characters.'],
        422,
      );
    }
    if ($newPassword !== $confirmPassword) {
      json_response(
        ['success' => false, 'message' => 'Password and Confirm Password do not match.'],
        422,
      );
    }
  }
  if (!in_array($newRole, ['Administrator', 'Responder'], true)) {
    json_response(['success' => false, 'message' => 'Invalid role.'], 422);
  }
  if (!in_array($newStatus, ['active', 'inactive'], true)) {
    json_response(['success' => false, 'message' => 'Invalid status.'], 422);
  }
  try {
    $pdo->beginTransaction();
    $name = array_key_exists('full_name', $d)
      ? trim((string) $d['full_name'])
      : $target['full_name'];
    $sets = ['full_name=?', 'role=?', 'status=?'];
    $p = [$name, $newRole, $newStatus];
    if ($hasProfilePicture && array_key_exists('profile_picture', $d)) {
      $profile = validate_profile_picture($d['profile_picture'] ?? null);
      $sets[] = 'profile_picture=?';
      $p[] = $profile;
    }
    if (!empty($d['password'])) {
      $sets[] = 'password_hash=?';
      $p[] = password_hash((string) $d['password'], PASSWORD_DEFAULT);
    }
    $p[] = $id;
    $pdo->prepare('UPDATE users SET ' . implode(',', $sets) . ' WHERE id=?')->execute($p);

    if ($newRole === 'Responder') {
      if ($hasUserId) {
        $q = $pdo->prepare('SELECT id FROM responders WHERE user_id=? LIMIT 1');
        $q->execute([$id]);
        $rid = $q->fetchColumn();
        if ($rid) {
          $q2 = $pdo->prepare('SELECT type,phone FROM responders WHERE id=?');
          $q2->execute([$rid]);
          $oldR = $q2->fetch() ?: ['phone' => ''];
          $rphone = array_key_exists('phone', $d) ? trim((string) $d['phone']) : $oldR['phone'];
          $pdo
            ->prepare('UPDATE responders SET full_name=?, phone=?, status=? WHERE id=?')
            ->execute([
              $name,
              $rphone,
              $newStatus === 'active' ? 'Available' : 'Unavailable',
              $rid,
            ]);
        } else {
          $pdo
            ->prepare(
              'INSERT INTO responders(user_id,full_name,type,phone,status) VALUES(?,?,?,?,?)',
            )
            ->execute([
              $id,
              $name,
              (string) 'General Responder',
              (string) ($d['phone'] ?? ''),
              $newStatus === 'active' ? 'Available' : 'Unavailable',
            ]);
        }
      } else {
        $q = $pdo->prepare('SELECT id FROM responders WHERE full_name=? ORDER BY id DESC LIMIT 1');
        $q->execute([$target['full_name']]);
        $rid = $q->fetchColumn();
        if ($rid) {
          $q2 = $pdo->prepare('SELECT type,phone FROM responders WHERE id=?');
          $q2->execute([$rid]);
          $oldR = $q2->fetch() ?: ['phone' => ''];
          $rphone = array_key_exists('phone', $d) ? trim((string) $d['phone']) : $oldR['phone'];
          $pdo
            ->prepare('UPDATE responders SET full_name=?,phone=?,status=? WHERE id=?')
            ->execute([
              $name,
              $rphone,
              $newStatus === 'active' ? 'Available' : 'Unavailable',
              $rid,
            ]);
        }
      }
    } elseif (normalize_role_label($target['role']) === 'Responder') {
      if ($hasUserId) {
        $pdo
          ->prepare('UPDATE responders SET status=? WHERE user_id=?')
          ->execute(['Unavailable', $id]);
      } else {
        $pdo
          ->prepare('UPDATE responders SET status=? WHERE full_name=?')
          ->execute(['Unavailable', $target['full_name']]);
      }
    }
    $pdo->commit();
    json_response([
      'success' => true,
      'message' =>
        $newStatus === 'active'
          ? 'Account approved and activated successfully.'
          : 'Account updated successfully.',
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    error_log('[users.php] Account update failed: ' . $e->getMessage());
    json_response(
      ['success' => false, 'message' => 'Account update failed. Please try again.'],
      500,
    );
  }
}
if ($m === 'DELETE') {
  $id = (int) ($_GET['id'] ?? 0);
  if (!$id) {
    json_response(['success' => false, 'message' => 'User ID is required.'], 422);
  }
  if ($id === $user['id']) {
    json_response(['success' => false, 'message' => 'You cannot delete your own account.'], 422);
  }
  $q = $pdo->prepare('SELECT role FROM users WHERE id=?');
  $q->execute([$id]);
  $t = $q->fetch();
  if (!$t) {
    json_response(['success' => false, 'message' => 'User not found.'], 404);
  }
  if (normalize_role_label($t['role']) === 'Super Admin') {
    json_response(
      ['success' => false, 'message' => 'The Super Admin account cannot be deleted.'],
      403,
    );
  }
  $pdo->beginTransaction();
  try {
    if (normalize_role_label($t['role']) === 'Responder') {
      $hasUserIdLocal = (bool) $pdo
        ->query(
          "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='responders' AND column_name='user_id'",
        )
        ->fetchColumn();
      if ($hasUserIdLocal) {
        $pdo->prepare('DELETE FROM responders WHERE user_id=?')->execute([$id]);
      } else {
        $qName = $pdo->prepare('SELECT full_name FROM users WHERE id=?');
        $qName->execute([$id]);
        $nm = $qName->fetchColumn();
        if ($nm !== false) {
          $pdo->prepare('DELETE FROM responders WHERE full_name=?')->execute([$nm]);
        }
      }
    }
    $pdo->prepare('DELETE FROM users WHERE id=?')->execute([$id]);
    $pdo->commit();
    json_response([
      'success' => true,
      'message' => 'Account and linked responder information deleted successfully.',
    ]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) {
      $pdo->rollBack();
    }
    error_log('[users.php] Account deletion failed: ' . $e->getMessage());
    json_response(
      ['success' => false, 'message' => 'Account deletion failed. Please try again.'],
      500,
    );
  }
}
json_response(['success' => false, 'message' => 'Method not allowed.'], 405);
