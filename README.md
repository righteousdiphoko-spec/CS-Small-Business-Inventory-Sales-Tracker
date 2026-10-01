# CS Small Business Inventory & Sales Tracker

This project provides authenticated inventory, loss management, point-of-sale, sales history, dashboard, and
CSV reporting workflows for small businesses. Business records are stored in PostgreSQL and
scoped to the authenticated business account by the Express API.

## Stack

- Next.js 16, React 19, TypeScript, and Tailwind CSS in `client/`
- Express 5 and Node.js in `server/`
- PostgreSQL through the `pg` driver

## Setup

Copy the safe template to `server/.env` and replace the placeholders locally. The real `.env`
file is ignored by Git:

```env
Copy-Item .env.example .env
```

`DATABASE_URL` is the backend PostgreSQL/Neon connection string. `CLIENT_ORIGIN` and
`PUBLIC_APP_URL` identify the frontend origin allowed by the Express API; the server accepts
both values. Optional comma-separated `CLIENT_ORIGINS` adds other exact origins, such as
Vercel preview deployments. Avoid wildcard origins. `PUBLIC_APP_URL` is the frontend base URL used in
password-reset links. SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
`SMTP_PASS`, and `EMAIL_FROM`) configure Nodemailer; use credentials and a sender address
approved by your provider. `SMTP_SECURE=true` is typical for port 465; use `false` for STARTTLS
on port 587. `PORT` is the local Express port; Render supplies `PORT` in production.

Install dependencies and start the API:

```powershell
cd server
npm install
npm start
```

In another terminal, configure `client/.env.local` if the API is not on the default URL:

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

Then start the frontend:

```powershell
cd client
npm install
npm run dev
```

The server creates the users, products, sales, sale-items, inventory-loss, and password-reset tables on
startup. Password recovery sends email through the configured SMTP service. Reset links expire
after 30 minutes, can be used once, and are stored only as token hashes. The raw token is put
in the reset link's URL fragment so it is not sent in the browser's HTTP request to the
frontend host. A password-change confirmation is sent after a successful reset. Set the SMTP
values in `server/.env` using
credentials from your email provider; never commit real credentials. Production must use an
HTTPS `PUBLIC_APP_URL` and a trusted email provider. Recovery integration tests inject a mock
transport and do not send email or require SMTP credentials.

### Deployment Configuration

In Render, configure `DATABASE_URL`, `CLIENT_ORIGIN`, `CLIENT_ORIGINS` (if needed), `PUBLIC_APP_URL`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `EMAIL_FROM` as service environment
variables. Use the Neon connection string for `DATABASE_URL`, the deployed Vercel origin for
`CLIENT_ORIGIN` and `PUBLIC_APP_URL`, and an HTTPS `PUBLIC_APP_URL`. Do not set
`TEST_DATABASE_URL` on the production service.

In Vercel, set `NEXT_PUBLIC_API_URL` to the Render service's base HTTPS origin, without an
`/api` suffix. This value is embedded during the frontend build. Do not put SMTP or database
credentials in Vercel frontend variables.

### Email Smoke Test

Set the SMTP variables and `EMAIL_FROM` in the local, ignored `server/.env`, then set
`TEST_EMAIL_TO` to an inbox you control and run:

```powershell
cd server
npm run test:email
```

The script verifies the SMTP transport and sends a non-sensitive test message. It does not
print SMTP credentials. This test requires valid provider settings; mock transport in the
automated integration suite does not prove real-world delivery.

Forgot-email lookup requires the exact registered account-holder and business names (case and
extra spaces are normalized). On a match, the API returns only a masked email address. Phone
recovery is not available because phone numbers are not collected or verified.

## Inventory Losses

Each authenticated business account can record losses only for its own products. From
Products & Stock, choose **Record Loss**, select a product, enter a positive quantity, reason,
date, and optional notes, then confirm. The API reads the current cost price, calculates the
loss amount, and updates stock plus the loss record in one transaction. A loss cannot exceed
available stock; products without a cost price must be updated before a loss can be recorded.
Loss History supports date, product, and reason filters. Deleting a loss restores its stock
quantity transactionally. The platform user-management Admin is separate and does not get
cross-business access to inventory losses.

Loss routes are `POST/GET /api/losses`, `GET /api/losses/:id`, and
`DELETE /api/losses/:id`; all require the business bearer token and scope data to its owner.
The idempotent startup schema creates `inventory_losses`. Reports subtract each recorded loss
once from gross profit to calculate net profit; losses are not sales and do not change sales
counts, revenue, or cost of goods sold.

## Validation

```powershell
cd server
node --check injex.js

cd ..\client
npx tsc --noEmit
npm run build
```

Recovery and inventory-loss integration tests require a dedicated, disposable PostgreSQL test database.
Set `TEST_DATABASE_URL` in the local shell or `server/.env` to a database different from
`DATABASE_URL`. The suite compares the host, port, and database name and fails rather than
using the application database. The test file exits with a clear error when
`TEST_DATABASE_URL` is missing; the suite is not silently skipped:

```powershell
cd server
$env:TEST_DATABASE_URL="postgres://test_user:test_password@localhost:5432/spazakeep_test"
npm test
```

Use your own disposable test connection string; do not paste credentials into source control
or chat. The suite creates temporary test users and deletes them after execution. Automated
email assertions use a mock transport and do not require SMTP credentials.

Manual acceptance should cover two registered businesses, product creation/restocking, loss
recording and stock restoration on loss deletion, date/product/reason history filters, net
profit after losses, an insufficient-stock sale, a successful sale, refresh/relogin persistence,
CSV export, and confirmation that one business cannot access another business's data with its
bearer token.
