# Admin CRUD for Registered Business Accounts

## Goal
Allow admins to manage existing registered business accounts while keeping registration as the only account creation path.

## Existing behavior
- Admin can list/search/filter database-backed registered users.
- Admin can delete non-admin users.
- Admin account is protected from deletion.
- There is no admin account-creation endpoint or form; preserve that restriction.

## Implement
- Add an admin-only `PUT /api/admin/users/:id` endpoint to edit an existing account's `name`, `businessName`, and `businessTagline`.
- Validate and trim fields; reject missing/empty required names and malformed IDs.
- Do not allow changing email, password, or role in this CRUD form/API. Keep the configured admin protected from edits that could undermine its account identity; deletion stays blocked.
- Add an Edit action/modal or inline editor to Manage Users, save through the authenticated admin API, update the list and recent-registration/dashboard views as appropriate.
- Preserve list, search, role filter, delete action, and admin navigation limited to Dashboard Overview and Manage Users.
- Every mutation requires an admin session and targets only the requested account ID; no create behavior is added.

## Validation
- Server syntax check, client TypeScript check, client production build, and diff check.
- Verify admin can edit a registered business's name/business name/tagline and sees the result after refresh.
- Verify a business-user token receives `403` from the edit endpoint.
- Verify protected admin account cannot be deleted and no UI or API creates users outside `/api/auth/signup`.
