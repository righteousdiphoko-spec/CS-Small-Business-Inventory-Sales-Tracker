# Provider-Agnostic SMTP

## Goal
Remove the application's Brevo-specific SMTP dependency and use standard Nodemailer SMTP configuration, while preserving the existing password recovery and safe test-email behavior.

## Findings
- The project uses CommonJS (`server/package.json` has `"type": "commonjs"`) and already has Nodemailer installed.
- `server/email-service.js` owns transport creation, sender formatting, reset/confirmation templates, and smoke-test diagnostics, but currently requires Brevo's exact hostname and port.
- `server/test-email.js` already supports `--verify-only`; its diagnostics/errors and validation mention Brevo.
- The email-service tests hard-code Brevo settings and reject other hosts.
- `server/injex.js` verifies SMTP in development and logs Brevo-specific status strings. Password-reset tokens and transaction logic are separate and must remain unchanged.
- The README is Brevo-specific. The example env file lacks the complete requested generic SMTP defaults and contains a non-empty test-recipient setting.
- `server/.gitignore` already ignores `server/.env`; never inspect, edit, stage, or print that file.

## Scope
- Make SMTP transport configuration provider-agnostic: validate a non-empty host, valid port, boolean `SMTP_SECURE`, and configured SMTP login/password, without pinning any hostname or provider.
- Preserve `EMAIL_FROM` as a validated email address and `EMAIL_FROM_NAME` as the display name; preserve current HTML/plain-text reset and confirmation content and subjects.
- Keep development-time transport verification and safe test diagnostics. Use generic SMTP wording, preserve `--verify-only`, and never log authentication credentials, reset tokens, or unrestricted error messages.
- Update generic SMTP tests to prove arbitrary valid SMTP hosts are accepted, transport options use environment values, and unsafe secrets are redacted.
- Update only SMTP-related recovery expectations if needed; preserve token hashing, expiry, single-use deletion, generic forgot-password responses, and transaction/failure behavior.
- Update `server/.env.example` with the requested generic fields: blank host/user/password/sender/test recipient, port 587, secure false, application sender name, and local `PUBLIC_APP_URL`. Keep all credentials as placeholders/blank and retain unrelated required database settings.
- Replace Brevo-only README instructions with generic provider setup, credential acquisition, configuration, verification, actual test delivery, production setup, security, and troubleshooting guidance.
- Do not modify frontend configuration, the local `.env`, or unrelated auth/business code.

## Acceptance Criteria
- Any normal authenticated SMTP provider can be configured solely through the standard backend environment variables.
- Both `npm run test:email -- --verify-only` and `npm run test:email` still use the existing `server/test-email.js`; verify-only sends no email, delivery mode requires `TEST_EMAIL_TO`.
- SMTP credentials remain backend-only and are never printed; safe diagnostics show host, port, sender, recipient, subject, and connection status.
- Reset and confirmation email content remains branded, HTML and plain-text, and the password reset security flow is unchanged.
- No Brevo-specific behavior or instructions remain in service code, tests, smoke-test messages, or README.
- `.env.example` has placeholders only and `.env` remains ignored and untouched.

## Validation
- Run `npm test` from `server/` with the distinct disposable test database configured.
- Run `npm run test:email -- --verify-only` from `server/`; report missing configuration safely or verified connection accurately.
- Run `npm run test:email` only if `TEST_EMAIL_TO` is configured, and report delivery only if the SMTP server accepts the message.
- Run server syntax check and the client TypeScript, lint, and production build checks; report existing unrelated lint failures separately.