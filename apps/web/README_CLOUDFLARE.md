# Cloudflare Pages Deployment

## Current Problem: 404 Errors

All routes return 404 even though deployment succeeds.

## Root Cause

Cloudflare Pages doesn't recognize `.next` as a Next.js App Router deployment when manually uploaded via Wrangler.

## Solutions

### Solution 1: Use Cloudflare Dashboard Build (Recommended)

Don't manually deploy. Let Cloudflare build from Git:

**In Cloudflare Dashboard → Pages → erc8004-web → Settings**:

1. Framework preset: **Next.js** (not "Other" or blank!)
2. Root directory: `apps/web`
3. Build command: 
   ```
   cd ../.. && pnpm install && pnpm build:sdks && NODE_ENV=production pnpm --filter erc8004-web build
   ```
4. Build output directory: `.next`
5. Node version: 18 or 20

**Then**: Set environment variables and let it deploy automatically.

### Solution 2: Use @cloudflare/next-on-pages Adapter

If you must use manual Wrangler deploys:

1. Build with adapter:
   ```bash
   cd apps/web
   pnpm build:cloudflare
   ```

2. Deploy the output:
   ```bash
   wrangler pages deploy .vercel/output/static --project-name=erc8004-web
   ```

3. Update `wrangler.toml`:
   ```toml
   pages_build_output_dir = ".vercel/output/static"
   ```

### Solution 3: Static Export (Limited)

If you don't need API routes:

1. Update `next.config.mjs`:
   ```javascript
   export default {
     output: 'export',
     // ... rest
   };
   ```

2. Build outputs to `out/`
3. Deploy: `wrangler pages deploy out`
4. Update `wrangler.toml`:
   ```toml
   pages_build_output_dir = "out"
   ```

## Why Manual Wrangler Deploy Fails

When you `wrangler pages deploy .next`:
- Cloudflare receives files
- Doesn't know it's Next.js
- Treats it as static HTML
- Can't handle routing → 404

Cloudflare needs either:
- Framework preset in dashboard (Solution 1)
- Special output from adapter (Solution 2)
- Static HTML export (Solution 3)

## Next Steps

**Check your Cloudflare Dashboard** and share:
1. Framework preset setting
2. Latest deployment build logs
3. Any errors shown

Then I can give you the exact fix!

