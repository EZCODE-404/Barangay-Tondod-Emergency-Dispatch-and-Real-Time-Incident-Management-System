<?php
/**
 * Validate the data-URL format produced by the existing profile-picture UI.
 * Only raster JPEG, PNG, and WEBP images are accepted; SVG and remote URLs are rejected.
 */
function validate_profile_picture(mixed $value): ?string
{
  if ($value === null || $value === '') {
    return null;
  }

  if (!is_string($value)) {
    json_response(['success' => false, 'message' => 'Invalid profile picture.'], 422);
  }

  // The UI accepts files up to 2 MiB. Base64 expands data by about one third.
  if (strlen($value) > 3000000) {
    json_response(['success' => false, 'message' => 'Profile picture must be 2 MB or smaller.'], 422);
  }

  if (!preg_match('#^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$#D', $value, $matches)) {
    json_response(['success' => false, 'message' => 'Use a valid JPG, PNG, or WEBP profile picture.'], 422);
  }

  $bytes = base64_decode($matches[2], true);
  if ($bytes === false || $bytes === '' || strlen($bytes) > 2 * 1024 * 1024) {
    json_response(['success' => false, 'message' => 'Profile picture is invalid or too large.'], 422);
  }

  if (!function_exists('getimagesizefromstring')) {
    error_log('[profile_picture] getimagesizefromstring is unavailable; image validation cannot run.');
    json_response(['success' => false, 'message' => 'Image validation is temporarily unavailable.'], 500);
  }

  $image = @getimagesizefromstring($bytes);
  $allowed = [
    'image/jpeg' => IMAGETYPE_JPEG,
    'image/png' => IMAGETYPE_PNG,
    'image/webp' => defined('IMAGETYPE_WEBP') ? IMAGETYPE_WEBP : -1,
  ];
  $declaredMime = $matches[1];
  if (
    $image === false ||
    !isset($allowed[$declaredMime]) ||
    $image['mime'] !== $declaredMime ||
    $image[2] !== $allowed[$declaredMime] ||
    $image[0] < 1 ||
    $image[1] < 1 ||
    $image[0] > 6000 ||
    $image[1] > 6000 ||
    ($image[0] * $image[1]) > 16000000
  ) {
    json_response(['success' => false, 'message' => 'The uploaded data is not a valid JPG, PNG, or WEBP image.'], 422);
  }

  return $value;
}
