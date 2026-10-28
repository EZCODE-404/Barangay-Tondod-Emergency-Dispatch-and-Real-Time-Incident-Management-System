<?php
function insert_incident(PDO $pdo, array $data): int
{
  $cols = [];
  foreach ($pdo->query('DESCRIBE incidents') as $row) {
    $cols[] = $row['Field'];
  }
  $optional = [
    'incident_no',
    'category',
    'location',
    'description',
    'priority',
    'reporter_name',
    'reporter_phone',
    'reported_by',
    'status',
    'source',
    'latitude',
    'longitude',
    'gps_accuracy',
    'public_token',
    'image_path',
  ];
  $insertCols = [];
  $values = [];
  foreach ($optional as $col) {
    if (in_array($col, $cols, true) && array_key_exists($col, $data)) {
      $insertCols[] = $col;
      $values[] = $data[$col];
    }
  }
  if (!$insertCols) {
    throw new RuntimeException('Incidents table has no compatible columns.');
  }
  $marks = implode(',', array_fill(0, count($insertCols), '?'));
  $sql = 'INSERT INTO incidents(' . implode(',', $insertCols) . ') VALUES(' . $marks . ')';
  $st = $pdo->prepare($sql);
  $st->execute($values);
  return (int) $pdo->lastInsertId();
}
