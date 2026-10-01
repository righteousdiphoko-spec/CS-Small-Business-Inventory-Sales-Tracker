# Use Database Role for Admin Identity

## Cause
The configured admin email was changed in PostgreSQL, but the application still hardcodes `admin@spazakeep.co.za` in both the client and server. This causes the new `admin@SME.co.za` account to be treated inconsistently for admin navigation, API authorization, and protected-account actions.

## Implement
- Treat the authenticated database `role` as the sole authority for admin access in client navigation and server authorization.
- Remove client email-based admin fallback checks; only `user.role === 'admin'` grants admin UI.
- Remove hardcoded-email role checks from signup. Registration should not grant admin based on a special email; admin role is provisioned/managed in database configuration.
- Configure bootstrap admin email through server environment (`ADMIN_EMAIL`) and reconcile only that configured account at startup. Keep a compatibility fallback for existing local installs if needed, but do not use it for authorization decisions.
- Protect records from edit/delete by database role, not a fixed email address. Ensure the logged-in admin account remains protected.
- Update login placeholder to a neutral example, not the stale admin email.
- Do not print secrets or query/alter unrelated user accounts.

## Validation
- TypeScript check, server syntax, production build, and diff check.
- Verify login response for the updated database admin includes `role: admin` and admin endpoints work.
- Verify ordinary business account remains `business_user` and receives `403` from admin routes.
- Verify admin actions remain restricted to role-authorized sessions regardless of the account email.
