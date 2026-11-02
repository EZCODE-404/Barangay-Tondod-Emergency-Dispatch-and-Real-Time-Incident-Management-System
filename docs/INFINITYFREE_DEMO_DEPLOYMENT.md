# InfinityFree Capstone Demo Deployment

Use this guide only for a school/capstone demonstration with fictional data. This free-hosted demo is not an emergency service and must not be used to receive real emergency reports. The public SOS form and incident feed are internet-accessible; do not put real names, phone numbers, addresses, photos, or responder information in the demo.

## Before uploading

1. Keep the local XAMPP site as your working copy. Do not upload `config/config.php`, `.env`, database dumps, backups, or real uploaded records.
2. Use a separate InfinityFree database for the demo. Do not connect the public demo to your local or production database.
3. If a hosted demo already exists, create a backup of its database and uploads before replacing files or clearing records. No previous hosted release or restore point is assumed to exist.
4. Confirm that `uploads/.htaccess` is included in your package. Git ignores runtime uploads, but this file is explicitly unignored and must be added to the deployment commit or uploaded separately; an untracked file is not included in a Git archive.

## Create and configure the host

1. Create the InfinityFree hosting account and add the domain/subdomain you will use for the presentation.
2. In the hosting control panel, create a MySQL database. Record the exact database name, username, password, and **MySQL hostname** shown in the panel. InfinityFree does not use `localhost` for the website database connection.
3. Open that database in the host's phpMyAdmin and import `database/schema.sql` from your computer into the new empty database. Do not import it into a database containing records; `CREATE TABLE IF NOT EXISTS` does not upgrade old tables.
4. Upload the project files into the website's `htdocs` folder. Include the root `.htaccess` and `uploads/.htaccess`. Do not upload `config/config.php`, `.env`, local database dumps, or existing files under `uploads/sos`.
5. In the hosting File Manager or FTP, copy `config/config.example.php` to `config/config.php` **on the server**, then edit the server copy:
   - Set `DB_HOST` to the MySQL hostname from the control panel (not `localhost` or `127.0.0.1`).
   - Set `DB_NAME`, `DB_USER`, and `DB_PASS` to the exact values shown for the new database.
   - Keep `DB_PORT` at the host's documented MySQL port (normally `3306`).
   - Set `FRONTEND_URL` to your HTTPS site origin.
   - Do not send credentials in chat, screenshots, source control, or this guide. InfinityFree does not provide user-set PHP environment variables, and `.env` is not loaded by this application.
6. Enable the host's SSL certificate for the domain. Wait until HTTPS works before continuing; the root `.htaccess` redirects public requests to HTTPS.
7. Ensure `uploads/sos` exists or can be created by PHP and is writable by the application. Keep the included `uploads/.htaccess` in place so uploaded content cannot run as server-side scripts.

## First administrator and smoke check

1. Open `https://your-domain/setup-admin.php` and create a unique demo Administrator password that is not used for any personal account.
2. Sign in at `https://your-domain/login.html`. Reopen `setup-admin.php` and confirm it reports that setup is locked after the account exists.
3. Check the protected paths: `/config/config.php`, `/database/schema.sql`, and `/pages/dashboard.html` should be denied directly. The public routes such as `/login.html` and `/bystander-sos.html` should still load.
4. Using fictional values only, submit one sample SOS report with a made-up contact number and a non-personal test image. Confirm it appears in the dispatch view and that the image can be viewed by the demo account.
5. Test the demo Administrator and Responder sign-in, one dispatch status update, public incident display, logout, and refresh. Check browser developer tools for failed requests and the hosting error log for PHP/database errors.
6. Verify the public feed contains only fictional records. It displays incident locations publicly, so use invented locations such as `Demo Area 1`, not real addresses.

## Backup and rollback

- Before updates, export the demo database from phpMyAdmin and download the current application files and `uploads/sos` contents. Keep backups off the public `htdocs` directory.
- If an update fails, restore the saved files and matching database backup together. No rollback is verified until you have created and tested a restorable backup; without one, recovery may require rebuilding the demo database and creating the demo account again.
- Do not drop or overwrite the database as a routine cleanup step. If you want a clean presentation dataset, export a backup first, then remove only demo records through the application or a reviewed database operation.
- After the presentation, stop sharing the public URL and remove demo records or the hosting account when you no longer need it. Keep any backup private and delete it when it is no longer needed.

## Host limitations

InfinityFree's free hosting has no uptime commitment and is intended for small, noncritical sites. Use this only as a presentation demo. The public incident screen polls less often on this deployment configuration to reduce requests; it is not a live emergency alert guarantee.
