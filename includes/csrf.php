
<?php
/** Session-backed CSRF protection for state-changing API requests. */
function csrf_token(): string
{
  if (empty($_SESSION['csrf_token']) || !is_string($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
  }

  return $_SESSION['csrf_token'];
}

function verify_csrf_request(): void
{
  $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

  if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
    return;
  }

 

  $expected = $_SESSION['csrf_token'] ?? '';
  $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

  if (
    !is_string($expected) || $expected === '' ||
    !is_string($provided) || $provided === '' ||
    !hash_equals($expected, $provided)
  ) {

    json_response([
      'success' => false,
      'message' => 'Invalid or missing CSRF token. Refresh the page and try again.',
      'code' => 'csrf_invalid',
    ], 403);
  }
}
