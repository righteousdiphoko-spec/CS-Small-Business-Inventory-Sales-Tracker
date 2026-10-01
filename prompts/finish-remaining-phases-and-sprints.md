# Finish Remaining Phases and Sprints

## Goal
Complete the unfinished contract work for the Small Business Inventory & Sales Tracker through Sprint 10, while keeping the implementation small enough to validate end to end.

## Current baseline
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS.
- Backend: Express with PostgreSQL via `pg`.
- Authentication and admin user management exist.
- Products, cart, and sales history currently live in browser localStorage rather than server persistence.
- Server currently persists users only.
- Admin user creation has been removed; public signup is the account-creation path.

## Fixed architecture
- Keep the existing Next.js client and Express server.
- Keep PostgreSQL with the existing `pg` driver; do not add an ORM.
- Keep the client/server boundary: the browser must use authenticated API routes for business data.
- Do not add a second state-management library.
- Enforce `business_id`/owner scoping in server queries and mutations, never only in the client.

## Implementation order
### Sprint 1 completion
- Record the chosen architecture and data-access decisions in `AGENTS.md` or the appropriate project documentation.
- Document the API routes as they are implemented.

### Sprints 3-4: Inventory
- Add PostgreSQL tables for products and stock movement history, owned by the authenticated user.
- Add authenticated product list/create/update and restock routes.
- Validate names, prices, quantities, and low-stock thresholds; never allow negative stock.
- Replace the client’s localStorage product mutations with API calls and loading/error states.
- Preserve category filtering and low-stock indicators.

### Sprints 5-6: POS and sales
- Add transaction and transaction-line tables, owned by the authenticated user.
- Add one authenticated sale-completion endpoint that validates all cart lines and atomically inserts the sale while decrementing stock.
- Reject insufficient stock and ensure a failed sale changes neither stock nor sales data.
- Add payment method, customer, subtotal, tax, total, timestamp, and reference fields.
- Load sales history from the server and replace local-only sale completion/history updates.

### Sprints 7-8: Dashboard and reporting
- Compute dashboard metrics from server data for the current business.
- Add readable sales trend and product-performance views.
- Add CSV export for the current business’s sales history or summary.
- Keep admin metrics separate from business metrics.

### Sprint 9: Security and isolation
- Centralize bearer-token authentication and current-user authorization helpers on the server.
- Audit every product, restock, sale, history, summary, and export query for owner scoping.
- Ensure logout removes client session state and invalid/expired sessions cannot access protected data.
- Do not expose password hashes or database credentials.

### Sprint 10: Release readiness
- Add focused server tests or executable API checks for signup/login, unauthorized access, cross-user access denial, stock validation, atomic sales, and CSV export.
- Resolve blocking client type/lint/build errors caused by the implementation; do not broaden into unrelated refactoring.
- Update README with setup, environment variables, database initialization, server/client startup, and manual acceptance steps.
- Add deployment and maintenance notes without committing secrets.

## Acceptance criteria
- Two registered business accounts cannot read or mutate each other’s products, stock, sales, or reports.
- Product and sale data survives refresh and relogin because it is stored in PostgreSQL.
- A completed sale atomically updates stock and history, and stock never becomes negative.
- Dashboard and summary values come from live server data.
- Admin sees registered users only and retains the existing protected user-management behavior.
- The project has documented setup and repeatable validation steps.

## Execution note
Implement in small validated slices, beginning with database schema plus authenticated product APIs, then integrate the client before proceeding to sales and reporting. Do not claim a sprint complete until its acceptance criteria have an executable check.
