# Loss Management

## Goal
Implement inventory loss management end to end using the existing Next.js client, Express 5 API, PostgreSQL `pg` driver, bearer sessions, and current styling. Do not introduce roles, frameworks, ORMs, or unrelated redesigns.

## Architecture findings and access decision
- Products are owned by `products.user_id`; sales and business reports are scoped to the authenticated business account.
- In this feature, “Admin” means the signed-in business account managing its own business. The existing `business_user` session represents that account; do not add or migrate roles.
- The existing `role === 'admin'` account is the separate platform user-management role, not the business Admin for this feature. Do not add loss navigation or grant cross-business loss/product access to that platform role; leave platform user-management behavior unchanged.
- All loss routes require a valid bearer session for a business account and scope every read/write to `currentUser.id`, matching existing product and sales routes. Missing/invalid tokens must receive 401; platform-admin sessions must not access business loss data. No business can read or mutate another business's loss or inventory records.

## Database and business rules
- Add an idempotent startup migration following `initializeDatabase()` conventions for a loss table, using a clear existing-style name such as `inventory_losses`.
- Store UUID id, nullable product FK, product-name snapshot, business-owner id and business-name snapshot for durable reporting, positive integer quantity, nonnegative cost-price snapshot, nonnegative calculated loss amount, required reason, optional notes, loss event date, and server-generated creation timestamp. Require a valid product owned by `currentUser.id` when creating a loss; use `ON DELETE SET NULL` for later product removal so historical loss data survives the existing user/product cascades. Scope active loss records by the owner id. Add checks/FKs and useful indexes for product/date/filter queries.
- Allowed reasons: `Damaged`, `Expired`, `Lost`, `Stolen`, `Spoiled`, `Written Off`, `Other`.
- Event date is required by the API; the UI defaults it to today. Store it as a date separately from the automatic `created_at` timestamp. Reject malformed dates/reasons/UUIDs, non-integer or non-positive quantities, and notes beyond a reasonable bounded length.
- Read current product cost and quantity from the database, never trust client-submitted cost or amount. Because `products.cost_price` is nullable, reject recording a loss for a product without a cost price and tell the Admin to set one first; do not silently value it at zero.
- `loss_amount = quantity * cost_price`, rounded/stored as currency using the database numeric columns. Lock the product row with `FOR UPDATE`, validate the product and sufficient stock, update stock, insert the loss, and commit in one transaction. Return the exact insufficient-stock message requested; roll back on every failed step.
- Delete must be authenticated and owner-scoped, transactional: lock the loss and, when its product still exists, the product; restore exactly the recorded quantity, delete the loss, and commit together. If the product was already removed, delete the retained historical loss without attempting a stock update. A repeated delete returns 404 and cannot restore stock twice. Follow current hard-delete patterns; do not add a sale or mutate sale rows.

## API
- Add `POST /api/losses`, `GET /api/losses`, `GET /api/losses/:id`, and `DELETE /api/losses/:id`, authenticated and scoped to the current business owner on every query/mutation.
- `GET /api/losses` supports validated `from`, `to`, `productId`, and `reason` filters, returns newest event dates/creation times first, and includes product name, quantity, cost snapshot, amount, reason, date, and notes. Do not expose another business's records.
- Reuse `GET /api/products` for the current business's product selector; do not add a cross-business product picker.
- Extend the existing business report/dashboard summary (or add a focused authenticated business summary route if clearer) for total, today, current-week, and current-month loss amounts, transaction count, highest-loss products, and daily trend data. Compute all values live from this business's loss records; define week consistently using the database's week boundary.
- Keep SQL parameterized. If a reusable `requireBusinessSession` helper is introduced, preserve existing route behavior and avoid unrelated refactors.

## Profit and reports
- Existing sale-time `sales.total_profit` is gross profit (`revenue - COGS`) and must remain historical and unchanged.
- Net profit is gross profit minus inventory losses, with each loss deducted once. Do not model losses as sales, include them in sales counts/revenue/CSV sales, or subtract a loss from product cost snapshots/COGS.
- Update existing summary profit calculations so each business summary reflects only that business owner's losses; do not return another business's loss records/details. Preserve existing report response fields where practical and label gross/net profit accurately in the UI.

## Frontend
- Add a Loss History view and Record Loss entry point under the existing business user's Inventory section, plus loss KPIs, top-loss products, and a time chart on that business's dashboard. Keep platform Admin user-management views and navigation unchanged.
- In the business Admin loss view, provide a Record Loss form/modal with product, positive quantity, reason, event date, and optional notes. Show selected product's cost price, available stock, and calculated estimate; amount is read-only and never submitted as authority.
- Add Loss History with date-range, product, and reason filters; newest first; show all requested fields for the current business. Include loading, error, and empty states.
- Confirm before recording and before deletion. Explain that deleting a loss restores stock. On successful create/delete, show feedback and refresh the product stock, loss history, business dashboard loss statistics, and net-profit summary.
- Keep accessible labels and responsive styling consistent with the existing client. No manual loss amount input and no new user role.

## Testing and verification
- Add focused Node integration tests using the existing dedicated `TEST_DATABASE_URL` safety guard and disposable-database pattern; tests must not touch the application DB.
- Cover authorization (unauthenticated and platform-admin sessions denied; business sessions allowed only for their own records), cross-business read/write denial, successful stock decrement and cost-based calculation, invalid quantity/reason/product/date/cost, insufficient-stock rollback, filters/order/detail, atomic delete and exact stock restoration, repeated delete, and no changes to sales/revenue/transaction counts.
- Cover report math: revenue 500, COGS 300, gross profit 200, loss 50, net profit 150; verify the loss is deducted once and scoped to the business owner.
- Run server syntax checks and tests when a dedicated test database is configured, plus client TypeScript, lint, and production build where available. Do not claim DB integration tests passed if `TEST_DATABASE_URL` is unavailable.
- Update README with the Loss feature, Admin access behavior, data migration/startup behavior, and manual acceptance steps. Do not include secrets.

## Acceptance criteria
- A signed-in business account can create, review, filter, and delete losses only for its own products; unauthenticated and platform-admin sessions cannot access business loss endpoints, and cross-business access is denied.
- Every create/delete changes stock and the loss table atomically; stock never goes negative; deletion restores stock once.
- Loss values always use the database product cost snapshot and cannot be edited by the client.
- The business dashboard and summaries use live owner-scoped loss data; gross profit, net profit, sales revenue, COGS, and sales counts remain mathematically distinct.
- Existing login, product, POS, history, reports, Admin user-management, and tenant-scoped business routes continue to work.

## Final response
After implementation, summarize files changed, database changes, API endpoints, frontend views, loss valuation, inventory behavior, profit behavior, checks performed, and any required configuration or migration steps.