# Manage Users: Registered Accounts Only

## Goal
Update the admin Manage Users workflow so administrators cannot create user accounts. Users must appear in the admin list only after registering through the public signup flow.

## Implementation
- Remove the admin create-user form from `client/app/page.tsx`.
- Remove the unused `newUserForm` state and `handleCreateUser` handler from the client.
- Keep the admin users list, search, role filter, registration metrics, recent registrations, and protected delete behavior working from the existing GET endpoints.
- Remove the admin `POST /api/admin/users` route from `server/injex.js`, making `/api/auth/signup` the only account-creation endpoint.
- Preserve existing authentication, admin authorization, and per-user data isolation behavior.

## Acceptance checks
- Admin Manage Users shows registered users and no account-creation inputs or button.
- A newly registered user appears after the admin refreshes or revisits Manage Users.
- Signup continues to create business-user accounts successfully.
- The admin can still search, filter, and remove eligible users.
- Client lint/build and server syntax checks pass.
