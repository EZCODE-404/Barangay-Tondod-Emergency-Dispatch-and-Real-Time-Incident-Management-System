# Phase 3 security changes

## Changes
- `.htaccess` redirects non-localhost requests to HTTPS while leaving `localhost` and `127.0.0.1` available for XAMPP development.
- `.htaccess` sends a Content-Security-Policy-Report-Only header so resource violations can be reviewed without blocking existing application resources.
- `pages/dashboard.html` pins Chart.js to version 4.4.7 instead of the floating `latest` release. Font Awesome was already version-pinned in the project.

## Before public deployment
1. Confirm a valid TLS certificate is active on the public domain and the host supports Apache rewrite/header directives.
2. Test HTTP-to-HTTPS redirects on the actual hosting platform. Do not rely on `X-Forwarded-Proto` unless it is set by a trusted proxy.
3. Open browser Developer Tools and review CSP Report-Only violations while checking login, dashboard charts, maps, SOS camera, profile images, and notifications.
4. Keep CSP in Report-Only mode until violations are understood. Then create a strict policy appropriate to the app, ideally using nonces/hashes rather than `unsafe-inline`.
5. Add Subresource Integrity hashes for CDN assets only after obtaining and verifying the exact bytes and hashes for the pinned versions. This patch does not invent SRI hashes.
6. Configure production database credentials independently; this patch does not change `config/config.php` or secrets.

## Verification status
This is a source-level patch. HTTPS behavior and CSP reports must be tested in XAMPP and again on the real hosting provider.
