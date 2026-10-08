# Integrate Brevo SMTP

## Goal
Use Brevo SMTP for the existing Nodemailer password-reset and password-change confirmation emails without rewriting authentication or changing token/database behavior.

## Findings
- Nodemailer is already installed in `server/`.
- SMTP transport and recovery email helpers currently live in `server/injex.js`.
- The existing reset flow uses SHA-256 token hashes, a 30-minute expiry, one-use deletion inside a transaction, generic forgot-password responses, and non-fatal confirmation delivery.
- `server/recovery.test.js` already injects a mock mail transport and exercises reset security and email failure behavior.
- `server/test-email.js` verifies SMTP and sends an email, but has no verify-only mode.
- `server/.env.example` needs Brevo placeholders and `EMAIL_FROM_NAME`; the local `server/.env` is untracked and must never be staged. `server/.gitignore` currently does not ignore `.env` itself.

## Scope
- Reuse or extract the current email helpers into one reusable server-side service; do not duplicate or rewrite auth, reset-token, or database logic.
- Configure Nodemailer from environment values for Brevo: `SMTP_HOST=smtp-relay.brevo.com`, port `587`, `SMTP_SECURE=false`, SMTP login/key, sender address/name, and `PUBLIC_APP_URL`.
- Format reset and confirmation messages with the configured application/sender name, professional HTML and plain-text alternatives, the existing secure reset URL, and clear security/expiry guidance.
- Keep SMTP credentials and raw reset tokens out of browser responses, source, logs, and committed templates.
- In development, verify a configured SMTP transport and report actionable, redacted server-side diagnostics. Missing settings must fail safely without exposing values.
- Add a verify-only mode to the SMTP smoke test so connectivity can be checked without sending mail; preserve an explicit opt-in delivery test requiring `TEST_EMAIL_TO`.
- Update `server/.env.example` with safe placeholders only, update `server/.gitignore` to ignore `.env` and local env files while retaining `.env.example`, and document Brevo account/SMTP credentials, sender verification, local test steps, production configuration, and delivery troubleshooting in `README.md`.
- Do not stage, read into output, or modify the existing local `server/.env`; do not add credentials to Vercel/frontend config.

## Acceptance Criteria
- Reset and confirmation emails use Brevo-configured Nodemailer transport and configured sender display name.
- Existing token security, generic forgot-password responses, transaction behavior, and confirmation-send failure semantics remain unchanged.
- Tests cover SMTP configuration/transport creation and reset/confirmation message content using mocks, while retaining expired, invalid, single-use, and successful reset coverage.
- The SMTP test can verify connectivity without sending a message and never prints credentials.
- `.env.example` contains placeholders only, `.env` is ignored, and no SMTP setting is exposed to the frontend.
- README explains Brevo setup, sender verification, local testing, production secrets, and common delivery failures.

## Validation
- Run server syntax checking and unit/integration tests with a distinct disposable `TEST_DATABASE_URL`; fail clearly and safely if it is missing.
- Run the client TypeScript, lint, and production build checks; report existing unrelated lint failures separately rather than refactoring unrelated code.
- Run the SMTP connectivity check only when valid backend Brevo credentials are already configured in the ignored local environment; use verify-only mode and do not send a message unless explicitly configured with `TEST_EMAIL_TO`.
- Do not claim live Brevo delivery unless the configured transport verification and delivery test actually succeed.