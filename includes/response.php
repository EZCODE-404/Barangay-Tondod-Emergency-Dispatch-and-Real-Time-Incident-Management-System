<?php
if (!function_exists('json_response')) {
  function json_response(array $data, int $status = 200): never
  {
    if (!headers_sent()) {
      http_response_code($status);
      header('Content-Type: application/json; charset=utf-8');
      header('Cache-Control: no-store');
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit();
  }
}

if (!function_exists('request_body')) {
  function request_body(): array
  {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
      return [];
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
      json_response(['success' => false, 'message' => 'Invalid JSON request body.'], 400);
    }
    return is_array($data) ? $data : [];
  }
}
