# Barangay Tondod Emergency Dispatch and Real-Time Incident Management System

This is an existing PHP/MySQL web application for incident reporting, dispatch, responder management, notifications, and reports. It is intended to be run through Apache/PHP and MySQL (for example, XAMPP).

## Important database safety

- `database/schema.sql` no longer drops or recreates existing tables and contains no demo user accounts, responder accounts, or sample incidents.
- Select the intended database in phpMyAdmin before importing the schema. The script creates missing tables and seeds the default area labels only.
- `CREATE TABLE IF NOT EXISTS` does not upgrade columns in an older table. For an existing installation, back up the database first and apply only the required, reviewed migration files. Do not treat the schema file as a complete upgrade migration.
- The schema is designed for a fresh installation. Existing records should be retained, but compatibility with every legacy schema must be checked before deployment.

## XAMPP fresh installation

1. Copy the project folder to `C:\xampp\htdocs\tondod` (or another folder under `htdocs`).
2. Start Apache and MySQL in XAMPP.
3. Open `http://localhost/phpmyadmin/` and create a database named `tondod_emergency`.
4. Select that database, then import `database/schema.sql`.
5. Copy `config/config.example.php` to `config/config.php`, then set `DB_USER` and `DB_PASS` for your local database. `config/config.php` is intentionally ignored by Git. If your local XAMPP installation uses the default root account with no password, that configuration is for local development only and must never be copied to a public server.
6. Open `http://localhost/tondod/setup-admin.php` and create a unique Administrator username and strong password. This page is available only while the `users` table is empty.
7. Open `http://localhost/tondod/login.html` and test login, incident reporting, dispatch, and responder workflows.

## Production configuration

- Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASS` as server environment variables where your host supports them. The application does not automatically load `.env` files.
- Use a dedicated database account with only the required permissions. Do not use MySQL `root` for a public deployment.
- Use HTTPS and unique account credentials. Never deploy a database with a known or shared password.
- Create the first Administrator only after importing the schema. Confirm that the account can log in, then verify that `setup-admin.php` is locked.
- Make and verify a database backup before applying any migration or schema change.

## Existing database: login throttling migration

Fresh installations receive the `login_attempt_limits` table from `database/schema.sql`. If the application was installed before that table was added, back up the database and run `database/migrations/2026_10_13_create_login_attempt_limits.sql` once in phpMyAdmin. The migration uses `CREATE TABLE IF NOT EXISTS` and does not delete existing records.

Other features may require migrations that are not included in every ZIP revision. Before running an upgrade, confirm the exact migration file exists in this package and inspect it. Do not run an undocumented reset script or re-import a schema into a database containing records unless you have verified its behavior and have a restorable backup.

## Public SOS reporting

The public SOS page is available at `/sos.html` or `/bystander-sos.html`. It does not require an account and supports an incident photo. A private tracking token is returned for tracking the submitted incident. The public tracking response intentionally excludes responder phone numbers and the full incident description.

## Security notes

State-changing session-authenticated API requests and login/logout now require a session-backed CSRF token. The browser API helper retrieves the token and sends it in the `X-CSRF-Token` header. Public SOS reporting remains unauthenticated by design and relies on its existing validation and rate limits; continue to monitor abuse.

This project should be tested locally in XAMPP before any public deployment. Syntax checks alone do not verify database compatibility, permissions, Apache behavior, or complete emergency workflows.
