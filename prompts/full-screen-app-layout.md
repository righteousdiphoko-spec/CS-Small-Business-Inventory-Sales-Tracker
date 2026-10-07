# Full-Screen App Layout

## Goal
Make the signed-in inventory workspace fill the browser viewport instead of appearing as a centered, framed panel with dark gutters.

## Local Hypothesis
The visible margins are caused by the app shell's outer padding and its centered `max-w-[1300px]` container. The rounded border, shadow, and fixed minimum height reinforce the framed-panel appearance.

## Scope
- Update only the signed-in app shell in `client/app/page.tsx` to use the available viewport width and at least the viewport height.
- Remove the outer desktop gutters and framed-panel styling so the workspace reaches the browser edges.
- Preserve the responsive sidebar/navigation behavior, existing page content, and product form fix.
- Do not change login-screen layout, APIs, business behavior, or data calculations.

## Acceptance Criteria
- At desktop widths, the workspace spans the full available browser width with no surrounding dark gutters.
- The workspace fills at least the viewport height while still growing and scrolling for longer content.
- Sidebar and main content remain usable at mobile, tablet, and desktop sizes.
- Existing navigation and product form actions remain visible and functional.

## Validation
- Read the relevant Next.js 16 CSS/layout guide under `client/node_modules/next/dist/docs/` before editing.
- Run TypeScript checking and the client production build.
- Inspect the signed-in workspace at desktop and mobile viewport sizes.