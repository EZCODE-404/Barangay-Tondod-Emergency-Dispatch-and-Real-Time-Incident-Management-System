# InfinityFree Capstone Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prepare a small PHP/MySQL capstone demo package and host-specific deployment runbook for InfinityFree.

**Architecture:** Keep the current application and schema. Add a focused deployment guide, include the upload directory's existing deny-execution rule in Git packages, and reduce public-screen polling.

**Tech Stack:** PHP, MySQL, JavaScript, Markdown, Git.

**Spec:** `docs/superpowers/specs/2026-11-02-infinityfree-capstone-demo-design.md`

## Global Constraints

- Use fictional records and contact details for the public demo.
- Never deploy local database credentials.
- Use database details assigned by InfinityFree; do not assume `localhost` or environment-variable support.
- Do not represent the demo as an operational emergency service.
- Do not add dependencies or run tests in this task.

## Review Focus

- Confirm the documented setup creates `config/config.php` on the host without shipping local secrets.
- Confirm the public upload protection file is no longer omitted by Git ignore rules.
- Confirm the documented rollback does not claim recovery without a known-good backup or prior release.
- Confirm the cadence changes apply only to polling and do not alter API contracts.
- Confirm HTTPS, first-admin lockout, and fictional-data smoke checks are explicit.

---

### Task 1: Prepare the demo deployment guide and package

**Files:**
- Create: `docs/INFINITYFREE_DEMO_DEPLOYMENT.md`
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `assets/js/latest-incidents.js`
- Modify: `assets/js/deployment-config.js`

**Interfaces:** No API or database interfaces change.

- [ ] Write the host-specific guide with preflight, new database/schema setup, server-only config, upload instructions, HTTPS checks, first-admin setup, smoke checks, backup, and limited rollback.
- [ ] Link the guide from the README and clarify that the documented migration file must be confirmed present before use.
- [ ] Add an ignore exception so `uploads/.htaccess` is included in Git-based packaging.
- [ ] Change both public incident polling intervals to 10 seconds and settings refresh to 30 seconds.
- [ ] Review the resulting diff and run `git diff --check`; report the observed result. Do not claim a deployed site or host-side behavior was verified.
