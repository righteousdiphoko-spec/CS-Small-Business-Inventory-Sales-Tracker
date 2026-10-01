# Admin Dashboard Navigation

## Goal
Keep business operations out of the admin dashboard navigation.

## Change
- Admin navigation should contain only `Dashboard Overview` and `Manage Users`.
- Business-user navigation remains unchanged with Products & Stock, Record Sale (POS), Sales History Log, and Sales Summary.
- Do not remove the business screens or change API access controls.

## Validation
- TypeScript check and Next.js production build pass.
- Verify admin navigation shows only Dashboard Overview and Manage Users.
- Verify a business account retains all four business navigation entries.
