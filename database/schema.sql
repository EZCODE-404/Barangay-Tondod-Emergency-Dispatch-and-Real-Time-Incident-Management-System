SET
  NAMES utf8mb4;

-- Select the target database in phpMyAdmin before importing this file.
CREATE TABLE IF NOT EXISTS areas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  area_name VARCHAR(100) NOT NULL UNIQUE,
  status ENUM ('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(120) NOT NULL,
  role ENUM ('Super Admin', 'Administrator', 'Responder') NOT NULL DEFAULT 'Responder',
  status ENUM ('active', 'inactive') NOT NULL DEFAULT 'active',
  profile_picture LONGTEXT NULL,
  area_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_area FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE SET NULL,
  INDEX idx_user_area (area_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS responders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL UNIQUE,
  area_id INT UNSIGNED NULL,
  full_name VARCHAR(120) NOT NULL,
  type VARCHAR(80) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  status ENUM (
    'Available',
    'On Duty',
    'On Scene',
    'En Route',
    'Standby',
    'Unavailable'
  ) NOT NULL DEFAULT 'Available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_responder_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_responder_area FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE SET NULL,
  INDEX idx_responder_area (area_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incidents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_no VARCHAR(30) NOT NULL UNIQUE,
  area_id INT UNSIGNED NULL,
  category VARCHAR(80) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description TEXT,
  priority ENUM ('Low', 'Moderate', 'High', 'Critical') NOT NULL DEFAULT 'Moderate',
  reporter_name VARCHAR(120),
  reporter_phone VARCHAR(30),
  reported_by INT UNSIGNED NULL,
  assigned_responder_id INT UNSIGNED NULL,
  status ENUM (
    'Pending',
    'Dispatched',
    'Active',
    'Resolved',
    'Cancelled'
  ) NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'Dashboard',
  latitude DECIMAL(10, 7) NULL,
  longitude DECIMAL(10, 7) NULL,
  image_path VARCHAR(255) NULL,
  gps_accuracy DECIMAL(10, 2) NULL,
  acknowledged_at DATETIME NULL,
  dispatched_at DATETIME NULL,
  public_token CHAR(48) NULL UNIQUE,
  CONSTRAINT fk_incident_area FOREIGN KEY (area_id) REFERENCES areas (id) ON DELETE SET NULL,
  CONSTRAINT fk_incident_user FOREIGN KEY (reported_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_incident_responder FOREIGN KEY (assigned_responder_id) REFERENCES responders (id) ON DELETE SET NULL,
  INDEX idx_incident_area (area_id),
  INDEX idx_incident_status (status),
  INDEX idx_incident_category (category),
  INDEX idx_incident_created (created_at),
  INDEX idx_incident_archived (archived_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sos_report_limits (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  client_key VARCHAR(100) NOT NULL,
  report_date DATE NOT NULL,
  report_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sos_client_day (client_key, report_date)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incident_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  incident_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX idx_incident_log_incident (incident_id),
  INDEX idx_incident_log_user (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS responder_devices (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  device_key VARCHAR(128) NOT NULL,
  device_name VARCHAR(160) NULL,
  user_agent VARCHAR(500) NULL,
  last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active TINYINT (1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_responder_device (user_id, device_key),
  INDEX idx_device_user (user_id),
  CONSTRAINT fk_responder_device_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS responder_notifications (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  incident_id INT UNSIGNED NULL,
  type VARCHAR(40) NOT NULL DEFAULT 'dispatch',
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_responder_notification_user (user_id, created_at),
  INDEX idx_responder_notification_incident (incident_id),
  CONSTRAINT fk_responder_notification_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_responder_notification_incident FOREIGN KEY (incident_id) REFERENCES incidents (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

INSERT IGNORE INTO areas (area_name, status)
VALUES
  ('Tondod Proper', 'active');

INSERT IGNORE INTO areas (area_name, status)
VALUES
  ('Area 2', 'active');

INSERT IGNORE INTO areas (area_name, status)
VALUES
  ('Area 3', 'active');

INSERT IGNORE INTO areas (area_name, status)
VALUES
  ('Area 4', 'active');

INSERT IGNORE INTO areas (area_name, status)
VALUES
  ('Area 5', 'active');

INSERT IGNORE INTO areas (area_name, status)
VALUES
  ('Area 6', 'active');

INSERT IGNORE INTO areas (area_name, status)
VALUES
  ('Area 7', 'active');

-- No user accounts or demo incidents are seeded. Create the first Administrator
-- through setup-admin.php after importing this schema.

CREATE TABLE IF NOT EXISTS login_attempt_limits (
  bucket_key CHAR(64) PRIMARY KEY,
  attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  window_started DATETIME NOT NULL,
  blocked_until DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_login_limit_updated (updated_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
