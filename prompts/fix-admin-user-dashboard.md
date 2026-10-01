# Fix Admin User Visibility

## Cause
The database contains the configured admin account with `role = 'business_user'`. The client recognizes the admin email, but the Express admin routes authorize strictly by `role`, so `/api/admin/dashboard` returns 403 and the dashboard cannot load registered-user counts.

## Change
- During database initialization, reconcile the configured `ADMIN_EMAIL` account to role `admin`, whether it is newly seeded or already present.
- Keep the existing admin API authorization check role-based; do not weaken authorization by relying on email at each route.
- Ensure startup migration changes only the configured admin account and preserves every other user's role/data.
- Verify `/api/admin/dashboard` and `/api/admin/users` return database-backed records for the admin, while a registered business account still receives 403.

## Validation
- Server syntax check.
- Start/restart API so database initialization applies the repair.
- Login as configured admin; verify role is `admin`, counts are nonzero when users exist, and users list includes registered businesses.
- Login as a business account; verify admin endpoints still return 403.
