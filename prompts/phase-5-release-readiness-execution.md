# Phase 5 Release Readiness Execution Prompt

## Goal
Complete the remaining Phase 5 work for the Small Business Inventory & Sales Tracker: secure the authenticated business API, verify data isolation and transactional integrity, add repeatable automated checks, clean up setup docs, and leave the project in a ready-to-run state for local validation and deployment.

## Working constraints
- Keep the app on the existing architecture: Next.js 16 + React 19 + TypeScript in `client/`, Express 5 + PostgreSQL via `pg` in `server/`.
- Do not add a second frontend framework, backend framework, ORM, or state-management library.
- Do not broaden scope beyond the project contract or the Phase 5 tasks.
- Keep changes small and validation-focused.
- Preserve existing business/admin flow behaviors while hardening them.
- Never expose credentials, password hashes, or privileged database details to the browser or docs.

## Required work
### 1) Authentication and authorization hardening
- Centralize bearer-token authentication and current-user checks for business-protected routes.
- Ensure admin-only auth stays separate from business authorization.
- Enforce per-business ownership in queries and mutation logic, not just route placement.
- Add session expiry and logout/revocation behavior without breaking the bearer-token contract.
- Ensure invalid, expired, or missing tokens return safe JSON errors.

### 2) Transactional stock and sales integrity
- Audit product, restock, and sales endpoints for owner scope and validation.
- Ensure sales cannot create negative stock and a failed sale leaves neither inventory nor sales records changed.
- Verify sales and line items are written atomically with the corresponding stock decrement.
- Preserve documented zero-cost legacy behavior where required.
- Keep summary/report queries scoped to the authenticated business only.

### 3) Automated verification
- Add or update focused server tests for:
  - signup/login validation
  - unauthorized access
  - two-business isolation on products and sales
  - attempted access to another business's product or report
  - insufficient-stock rollback
  - valid sale atomicity and stock decrement
  - CSV export scope
  - expired or revoked tokens
- Use a dedicated test database URL and fail safely if the test DB is not configured or is not a distinct test database.
- Keep validation executable and repeatable from a clean checkout.

### 4) Documentation cleanup and release readiness
- Remove any real-looking credentials, demo passwords, or production secrets from README and project docs.
- Update setup instructions to include environment variables, startup commands, database setup, and validation steps.
- Document local testing and production safety practices without leaking secrets.
- Make sure project notes reflect the actual repo structure: frontend under `client/`, backend under `server/`.

### 5) Validation and regression checks
Run the relevant checks after implementation:
- `cd server && node --check injex.js`
- `cd server && npm test` (or equivalent focused server tests)
- `cd client && npx tsc --noEmit`
- `cd client && npm run build`

Fix only the issues required for this Phase 5 work and do not perform unrelated refactors.

## Acceptance criteria
- Business routes reject missing, invalid, or expired tokens.
- Business users cannot access another business’s products, sales, stock, or report data.
- Insufficient stock results in no stock or sales change.
- Valid sales update stock and record sale history atomically.
- Admin routes remain protected and separated from business scopes.
- No checked-in documentation contains usable credentials or secrets.
- Local setup and validation steps are documented and executable.
- The project can be started and checked in a clean environment without guesswork.

## Output expectations
- Implement only after approval.
- Keep the patch concise and directly tied to these Phase 5 issues.
- Share the exact validation commands and their outcome after running them.
