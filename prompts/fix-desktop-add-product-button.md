# Fix Desktop Add Product Button

## Problem
On desktop, the product-entry form's Add button is pushed beyond the visible content area. It appears on mobile because the form fields stack there.

## Root Cause
In `client/app/page.tsx`, the form switches at the `md` breakpoint to six grid tracks (`md:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto]`). The signed-in app reserves 220px for navigation, leaving too little width for five inputs, gaps, and the submit button. Grid items' intrinsic minimum widths make the form overflow.

## Change
- Reflow the product-entry form into a responsive grid that only uses multiple columns when the available content width supports them.
- Keep every input and the submit button visible and reachable at common desktop, tablet, and mobile widths, with no horizontal overflow from the form.
- Preserve the existing fields, validation, editing state, submit handler, and pending label.
- Do not change product APIs, data behavior, or unrelated screens.

## Validation
- Read the relevant Next.js 16 CSS/layout guide under `client/node_modules/next/dist/docs/` before editing.
- Run TypeScript checking and the client production build.
- Inspect the product screen at desktop and mobile widths and verify the Add button is visible and usable.