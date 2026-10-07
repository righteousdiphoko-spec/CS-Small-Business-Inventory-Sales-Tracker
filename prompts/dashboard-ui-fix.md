# Dashboard UI Fix

## Goal
Make the signed-in business dashboard and app shell clear, polished, and usable on desktop and mobile, while preserving the existing product workflows and visual direction for Khethelo Bakery.

## Local Hypothesis
The app shell always renders a fixed 220px sidebar beside the main content (`grid-cols-[220px_1fr]`). On narrow screens this is likely to squeeze or overflow the dashboard, and its KPI and activity sections can compound the problem. Verify this at mobile and desktop viewport sizes before choosing the smallest effective layout change.

## Scope
- Improve responsive behavior of the signed-in shell, navigation, dashboard KPI row, loss summary, stock alerts, recent sales, and admin overview.
- Preserve business and admin navigation destinations, authentication behavior, live API-backed values, and existing sales/inventory actions.
- Keep the existing React state approach and dependencies; do not add a UI framework or state-management package.
- Keep styling consistent with the current restrained neutral palette; clarify hierarchy, spacing, and compact-screen readability without adding decorative marketing content.
- Do not alter server/API behavior or business data calculations.

## Acceptance Criteria
- No horizontal page overflow at common mobile widths; navigation and content remain reachable and legible.
- Dashboard KPI and content sections reflow cleanly across mobile, tablet, and desktop widths without overlapping or forcing unusably narrow columns.
- Sidebar/navigation remains clear and usable at each breakpoint, with logout accessible.
- Admin and business users retain their existing navigation items and actions.
- Empty, loading, and populated dashboard states remain coherent.
- Existing data, business workflows, and role-specific screens continue to work.

## Validation
- Read the relevant Next.js 16 guides under `client/node_modules/next/dist/docs/` before editing.
- Run `npx tsc --noEmit`, `npm run lint`, and `npm run build` from `client`.
- Start the app and inspect the signed-in dashboard at mobile and desktop viewport sizes; confirm no horizontal overflow or overlapping controls.
- Report the exact UI test steps and any environment limitation that prevents them.