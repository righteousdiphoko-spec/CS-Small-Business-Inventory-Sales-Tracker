# Phase 5: Security, Verification, and Release Readiness

## Goal
Complete Phase 5 of the project contract without changing the agreed stack. Harden authentication/session behavior, verify multi-tenant data isolation and transactional sales, remove credential leakage from documentation, and provide repeatable release checks.

## Fixed architecture
- Frontend: Next.js 16, React 19, TypeScript.
- Backend: Express 5 on Node.js.
- Database: PostgreSQL accessed through `pg`; do not add an ORM or alternate framework.
- The browser uses the existing same-origin `/api` proxy and authenticated Express routes.

## Current gaps
- Server auth helpers are duplicated across business/admin endpoints.
- Sessions are stored in an in-memory map without expiry and there is no logout/revocation endpoint.
- There are no automated server tests.
- Sales/stock atomicity and cross-business isolation are not covered by repeatable tests.
- README currently includes real-looking sample business credentials and a demo admin password.
- Async route failures and database errors do not have a consistent safe JSON error handler.

## Implementation requirements
1. Centralize bearer authentication and admin authorization middleware/helpers; use them across every protected route without changing owner scoping.
2. Add session expiry and logout/revocation behavior, preserving the existing bearer-token contract and requiring fresh login after expiration.
3. Make API errors return consistent JSON without leaking SQL, password hashes, tokens, or connection details.
4. Add automated server tests using the existing Node.js stack. Use a dedicated test database URL and fail safely if it points to the configured non-test database; do not perform destructive cleanup against a normal database.
5. Cover signup/login validation, unauthorized access, two-business product/sale/report isolation, attempts to update/restock another business's product, insufficient-stock rollback, atomic stock decrement plus sale creation, cost/profit snapshots, and CSV tenant scope.
6. Preserve legacy products/sales; legacy missing costs must use the documented zero-cost behavior and migrations remain idempotent.
7. Remove real credentials from README and document environment setup with placeholders, startup, migrations, tests, production secrets, and backup/maintenance guidance.
8. Run client typecheck/build/lint and server tests/syntax check; fix issues caused by Phase 5 changes, keeping unrelated refactors out of scope.

## Acceptance criteria
- All protected API routes reject missing/invalid/expired tokens.
- Admin routes reject business users; business routes enforce user ownership in the SQL statements.
- Tests prove business A cannot read, update, restock, sell, export, or report on business B's records.
- An insufficient-stock sale leaves inventory and sales unchanged; a valid sale atomically records sale, line-item cost/profit snapshots, and stock changes.
- No checked-in documentation contains usable credentials or secrets.
- Setup and test instructions work from a clean checkout with PostgreSQL configured.
