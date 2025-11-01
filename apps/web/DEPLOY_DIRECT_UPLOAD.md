# Direct Upload Deployment (NOT RECOMMENDED)

## Problem

Direct Upload to Cloudflare Pages **does not work** for Next.js API routes that use `export const dynamic = 'force-dynamic'`.

Even though the deployment succeeds, API routes will return 404 errors because:
1. Next.js dynamic API routes require server-side execution
2. Direct Upload only serves static files
3. No way to run Next.js runtime in Direct Upload mode

## The Solution: Use Git-connected Cloudflare Pages

**You MUST use the Cloudflare Dashboard with Git connection** to deploy Next.js applications with API routes.

See: [`DEPLOY_CLOUDFLARE.md`](./DEPLOY_CLOUDFLARE.md) for the correct deployment method.

## Why This Happens

When you run:
```bash
wrangler pages deploy .next --project-name=erc8004-web
```

Cloudflare uploads the files as static assets. It does NOT:
- ✅ Execute Next.js server
- ✅ Run API route handlers
- ✅ Support dynamic rendering
- ✅ Support `export const dynamic = 'force-dynamic'`

Only **Git-connected Cloudflare Pages** with the "Next.js" framework preset can:
- Build your application properly
- Deploy with Next.js runtime
- Execute API routes
- Handle dynamic rendering

## Bottom Line

**You cannot use Direct Upload for this application** because it needs API routes.

Connect your GitHub repository to Cloudflare Pages following [`DEPLOY_CLOUDFLARE.md`](./DEPLOY_CLOUDFLARE.md).


