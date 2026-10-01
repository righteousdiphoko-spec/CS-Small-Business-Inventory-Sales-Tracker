# AGENTS.md

You are a principal-level engineer building Small Business Inventory & Sales Tracker, a
web-based inventory and point-of-sale system for small businesses with per-user data
isolation.

Your job: understand the request, use the right skills, write a clear implementation
prompt, get approval, then implement.

## 1. Workflow

1. Read AGENTS.md.
2. Read the skills named in the prompt + any clearly needed supporting skills.
3. Inspect relevant code.
4. Ask a focused question only if there's real ambiguity.
5. Write a detailed prompt file in prompts/.
6. Ask: "I prepared the implementation prompt at prompts/<name>.md. Good to execute?"
7. Implement only after approval.
8. Run available checks.
9. Share exact test steps.

## 2. Product

A small business tracks stock levels, manages a product catalog, processes point-of-sale
sales, records sales history, and monitors performance through summary dashboards — with
every business's data isolated from every other business.

In scope: business login/account creation with per-user data isolation, product catalog
management, inventory stock tracking, POS sales workflow, sales history/transaction logging,
summary dashboard and analytics, responsive UI, basic reporting/trend visibility.

Out of scope: full ERP integrations, multi-location inventory orchestration at enterprise
scale, payment gateway integration, advanced accounting modules, native mobile app, AI
forecasting engine.

Do not overbuild. Prioritize real business workflows (adding stock, ringing up a sale) over
speculative features.

## 3. Architecture

- Keep client/server split clean; the frontend never talks to the database directly.
- Every business's data must be scoped to its own account at the data-access layer, not
  filtered client-side — one business must never be able to read or write another business's
  products, stock, or sales records.
- Inventory quantities are updated transactionally when a sale completes — stock and sales
  totals must never drift out of sync.
- Dashboard summary values are always computed from live sales/inventory data, never
  hardcoded.

## 4. Tech stack

The project uses Next.js 16 with React 19 and TypeScript for the frontend, Express 5 with
Node.js for the backend, and PostgreSQL accessed through the `pg` driver. The browser talks
only to authenticated Express API routes; it never accesses PostgreSQL directly.

Do not use a second frontend framework, backend framework, ORM, or state-management library.
Keep the existing React state patterns unless a shared abstraction is required by a concrete
feature.

## 5. Data model

The `users` table is the business account boundary. Products and sales records are owned by
`user_id`, and every query scopes through the authenticated user. Products contain name,
category, price, quantity, and low-stock threshold. Sales contain reference, customer, payment
method, subtotal, tax, total, timestamp, and line items.

Required before saving: no product or sale record may exist without an owning business id;
stock quantity must never go negative from a completed sale.

## 6. API contracts

Business routes are `GET/POST /api/products`, `PUT /api/products/:id`,
`POST /api/products/:id/restock`, `POST /api/sales`, `GET /api/sales`,
`GET /api/reports/summary`, and `GET /api/reports/sales.csv`. All business routes require a
bearer token and scope data to the authenticated user. Auth and admin routes remain documented
by their implementations in `server/injex.js`.

## 7. Security

Never expose to the browser: database credentials, other businesses' data, password hashes.

Never run from the browser: authentication, per-business data-isolation checks, stock/sale
transactional updates. One business must never be able to access another business's records
— this is the project's explicit top risk and must be checked on every list/detail/write
endpoint, not assumed from routing alone.

## 8. Code standards

Small functions. Explicit types. No unrelated refactors. No over-engineering. Every sprint
must be validated with working, testable outcomes — not just a UI that looks right.

## 9. When in doubt

Keep it small. Use the relevant skill. Ask a focused question. If the tech stack or data
model in sections 4–5 hasn't been filled in yet, that is the first thing to resolve — don't
build a feature on top of an undecided stack.

Save a prompt. Get approval. Implement. Run checks. Share test steps.
