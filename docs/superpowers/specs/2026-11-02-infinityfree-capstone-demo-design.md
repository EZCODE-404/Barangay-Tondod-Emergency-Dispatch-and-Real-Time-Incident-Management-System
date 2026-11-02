# InfinityFree Capstone Demo Design

## Intent

Prepare the existing PHP/MySQL capstone for a small public demonstration on InfinityFree using fictional incident data. It is a presentation environment, not an operational emergency dispatch service.

## Goals

- Give the user a safe, host-specific setup path that does not rely on unsupported environment variables or local XAMPP credentials.
- Ensure uploaded files cannot execute scripts when the project is packaged from Git.
- Reduce the public display's request rate for a demo host.
- Include staged setup, smoke checks, backup, and limited rollback instructions.

## Non-goals and constraints

- Do not upload files or access an InfinityFree account from this workspace.
- Do not include real database credentials, personal data, or real emergency records in the package.
- Do not change application data contracts or remove the public SOS and incident display features.
- Do not treat the resulting deployment as suitable for live emergency operations.

## Approaches

- **InfinityFree demo package and runbook (chosen):** Small documentation and packaging changes plus slower polling. This fits the capstone presentation use and addresses the known host constraints with minimal code changes.
- **Live deployment hardening on a supported host:** Requires a different host and operational requirements; out of scope for a school demo.
- **Keep the application unchanged and provide chat-only steps:** Fastest, but leaves the ignored upload protection file and high polling interval easy to miss during deployment.

## Design

Add an InfinityFree-specific guide linked from the README. The guide will explain the control-panel-provided MySQL hostname and credentials, creation of a server-only `config/config.php`, schema import into a new database, HTTPS, initial-admin locking, fictional-data smoke checks, database/upload backup, and the limits of rollback without a previous release. Include `uploads/.htaccess` in Git-based packages and slow the two public incident polls to 10 seconds and deployment settings refresh to 30 seconds.

## Open implementation choices

Use only existing PHP, SQL, and JavaScript. Do not add dependencies. Keep local ignored files untouched. Verify through diff review and whitespace checks; no automated test suite or host credentials are available in this workspace.
