<?php
require_once __DIR__ . '/config/config.php';
require_once __DIR__ . '/config/database.php';

$pdo = db();
$count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();

if ($count > 0) {
  http_response_code(403);
  header('Content-Type: text/html; charset=utf-8');
  echo '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Setup Locked</title><style>body{font-family:Arial,sans-serif;background:#f3f7f4;display:grid;place-items:center;min-height:100vh;margin:0}.box{max-width:520px;background:#fff;padding:32px;border-radius:18px;box-shadow:0 12px 40px #0001;text-align:center}a{display:inline-block;margin-top:18px;padding:12px 18px;border-radius:10px;background:#0b7a45;color:#fff;text-decoration:none}</style></head><body><div class="box"><h1>Setup Locked</h1><p>An account already exists. The first administrator setup is permanently locked.</p><a href="login.html">Go to Login</a></div></body></html>';
  exit();
}

if (session_status() === PHP_SESSION_NONE) {
  session_start();
}
if (empty($_SESSION['first_admin_csrf'])) {
  $_SESSION['first_admin_csrf'] = bin2hex(random_bytes(24));
}
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (!hash_equals($_SESSION['first_admin_csrf'], (string) ($_POST['csrf'] ?? ''))) {
    $error = 'Invalid setup request. Refresh the page and try again.';
  } else {
    $username = trim((string) ($_POST['username'] ?? ''));
    $fullName = trim((string) ($_POST['full_name'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $confirm = (string) ($_POST['confirm_password'] ?? '');

    if (!preg_match('/^[A-Za-z0-9._$-]{3,50}$/', $username)) {
      $error =
        'Username must be 3-50 characters and use only letters, numbers, dot, underscore, dollar sign or hyphen.';
    } elseif ($fullName === '' || strlen($fullName) > 120) {
      $error = 'Enter a valid full name.';
    } elseif (strlen($password) < 8) {
      $error = 'Password must be at least 8 characters.';
    } elseif ($password !== $confirm) {
      $error = 'Password and Confirm Password do not match.';
    } else {
      try {
        $pdo->beginTransaction();
        $lockCount = (int) $pdo->query('SELECT COUNT(*) FROM users FOR UPDATE')->fetchColumn();
        if ($lockCount > 0) {
          throw new RuntimeException('Setup is already locked because an account exists.');
        }
        $st = $pdo->prepare(
          'INSERT INTO users(username,password_hash,full_name,role,status) VALUES(?,?,?,?,?)',
        );
        $st->execute([
          $username,
          password_hash($password, PASSWORD_DEFAULT),
          $fullName,
          'Administrator',
          'active',
        ]);
        $pdo->commit();
        unset($_SESSION['first_admin_csrf']);
        header('Location: login.html?setup=complete');
        exit();
      } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
          $pdo->rollBack();
        }
        $error = 'Could not create the first Administrator. The username may already exist.';
      }
    }
  }
}
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>First Administrator Setup</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:linear-gradient(135deg,#edf8f1,#f9fbfa);font-family:Arial,Helvetica,sans-serif;color:#163126}.card{width:min(480px,100%);background:#fff;border:1px solid #dce9e1;border-radius:22px;padding:32px;box-shadow:0 20px 60px #0b3d2e18}.brand{display:flex;align-items:center;gap:14px;margin-bottom:22px}.brand img{width:54px;height:54px;border-radius:14px}.brand h1{font-size:21px;margin:0}.brand p{margin:4px 0 0;color:#688074;font-size:13px}label{display:block;font-weight:700;font-size:13px;margin:15px 0 7px}input{width:100%;padding:13px 14px;border:1px solid #cfded5;border-radius:11px;font-size:15px;outline:none}input:focus{border-color:#0b7a45;box-shadow:0 0 0 3px #0b7a4514}button{width:100%;border:0;border-radius:11px;padding:14px;margin-top:20px;background:#0b7a45;color:#fff;font-size:15px;font-weight:700;cursor:pointer}.notice{padding:12px 14px;border-radius:10px;background:#eef7f1;color:#315d47;font-size:13px;margin-bottom:16px}.error{padding:12px 14px;border-radius:10px;background:#fff0f0;color:#a52828;font-size:13px;margin-bottom:16px}.small{font-size:12px;color:#71847a;margin-top:12px;line-height:1.5}
</style>
</head>
<body>
<main class="card">
<div class="brand"><img src="/assets/icons/icon-192.png" alt="Emergency Dispatch"><div><h1>First Administrator Setup</h1><p>Barangay Tondod Emergency Dispatch</p></div></div>
<div class="notice">This one-time setup is available only while the database has <strong>zero user accounts</strong>. After the first Administrator is created, this page locks automatically.</div>
<?php if ($error !== ''): ?><div class="error"><?= htmlspecialchars(
  $error,
  ENT_QUOTES,
  'UTF-8',
) ?></div><?php endif; ?>
<form method="post" autocomplete="off">
<input type="hidden" name="csrf" value="<?= htmlspecialchars(
  $_SESSION['first_admin_csrf'],
  ENT_QUOTES,
  'UTF-8',
) ?>">
<label for="username">Administrator Username</label>
<input id="username" name="username" required maxlength="50" autocomplete="username">
<label for="full_name">Full Name</label>
<input id="full_name" name="full_name" required maxlength="120" autocomplete="name">
<label for="password">Password</label>
<input id="password" name="password" type="password" required minlength="8" autocomplete="new-password">
<label for="confirm_password">Confirm Password</label>
<input id="confirm_password" name="confirm_password" type="password" required minlength="8" autocomplete="new-password">
<button type="submit">CREATE FIRST ADMINISTRATOR</button>
</form>
<p class="small">For production, use a unique strong password and keep the account credentials private.</p>
</main>
</body>
</html>
