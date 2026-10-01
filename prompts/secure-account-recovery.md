# Secure Password and Email Recovery

## Goal
Complete the password-reset experience for any registered business account: deliver a secure reset link by email, allow a single-use password change within 30 minutes, and email a confirmation after success. Preserve the existing generic response and avoid revealing whether an account exists.

## Existing constraints
- Frontend authentication and recovery views are implemented in `client/app/page.tsx`; keep the existing design and responsive behavior.
- Backend is Express 5 in `server/injex.js`; PostgreSQL uses `pg` with idempotent startup DDL.
- Passwords use Node.js `crypto.scryptSync`; preserve this format for existing accounts.
- Hashed reset-token storage, reset validation, session invalidation, and IP/email rate limits already exist. Reuse and adjust them rather than duplicating the flow.
- Current reset tokens expire after 20 minutes, and development currently logs reset URLs instead of sending email. No mail transport dependency is installed.
- `PUBLIC_APP_URL` is used to construct the link; the frontend's `/api/*` rewrite provides same-origin API access.
- No phone number is stored for users. Keep the existing Forgot Email flow and its behavior unchanged.

## Implement
### Password reset API and email delivery
- Change reset-token expiry to exactly 30 minutes. Generate a cryptographically secure, high-entropy, single-use token; persist only its SHA-256 hash, with account ownership and expiry in PostgreSQL.
- Keep `POST /api/auth/forgot-password` generic for valid, invalid, existing, and non-existing addresses, including rate-limited requests. Never include the raw token or account-existence details in its response.
- Preserve bounded per-IP and normalized-email rate limits. Do not let provider errors or timing-sensitive response differences disclose whether the address is registered.
- Send reset and password-change confirmation emails through Nodemailer configured for SMTP. Add Nodemailer to `server/package.json` and read all transport settings from server environment variables, including `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, and `PUBLIC_APP_URL`. Do not hard-code credentials, API keys, tokens, or secrets.
- Build reset links from `PUBLIC_APP_URL`, require HTTPS for production configuration, and include the raw token only in the emailed reset link. Remove terminal logging of reset URLs and tokens in all environments. Log only safe, non-sensitive delivery failure information.
- If reset-email delivery fails, keep the API response generic and do not leave an unusable active token. Ensure retries remain safe and rate limited.
- `POST /api/auth/reset-password` must reject malformed, invalid, expired, or already-used tokens. Atomically validate and consume the matching token while updating the password; concurrent requests must not both succeed. Validate password length and confirmation, preserve the current scrypt hash format, and invalidate all existing in-memory sessions for that user after commit.
- After a successful password update, send a confirmation email to the account's registered address. Do not send confirmation for failed resets. Email-delivery failure must not roll back an already committed password change or report that the password reset failed; record a safe server-side failure and return the successful reset result.
- Keep all account lookup and update operations parameterized and scoped through the token's `user_id`.

### Frontend
- Preserve the existing `Forgot Password?` login link and forgot-password view. Ensure the reset link opens the existing Reset Password view with New Password, Confirm New Password, and Reset Password controls.
- Keep accessible labels, responsive layout, pending/error/success states, and generic confirmation copy: “If an account exists for this email, a password reset link has been sent.”
- Show a clear generic invalid-or-expired-link message and never expose the token outside the reset URL/request needed for the flow.
- Do not change login/signup, business/admin routing, or the existing Forgot Email flow beyond what is required to keep the shared auth views working.

## Security and compatibility
- Keep signup as the only account-creation path.
- Never store or log raw reset tokens; never expose them in API responses or frontend status messages.
- Keep reset tokens single-use, expire them after 30 minutes, and ensure only a successful atomic password reset consumes the token.
- Keep rate limits bounded and tested; use the existing in-memory limiter for this single-process server unless a shared production store is already configured.
- Keep SMTP credentials only in ignored environment files/deployment secrets. Update README with variable names and safe placeholders, never real credentials.
- Do not add an ORM or another backend framework.

## Validation
- Extend recovery integration tests using a mocked Nodemailer transport; tests must not send real email or require real SMTP credentials.
- Cover identical generic responses for existing/non-existing addresses, rate limits, one reset email with a usable link, hashed-only token storage, exact 30-minute expiry, invalid/expired/reused tokens, concurrent single-use behavior, successful password login, session invalidation, confirmation email after success only, and safe behavior when either email delivery fails.
- Keep existing Forgot Email tests passing.
- Run server syntax/tests, client TypeScript, lint where available, and production build. Use only a dedicated `TEST_DATABASE_URL` and preserve the existing guard against using the application database for destructive tests.
- Update README setup and manual acceptance steps for SMTP environment configuration, HTTPS production URL, reset-link delivery, 30-minute expiry, confirmation email, and mocked test delivery. Use placeholders only.
