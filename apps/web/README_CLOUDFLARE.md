# Cloudflare Pages Deployment

## Current Status

✅ **Site is deployed and loading**: https://www.8004-agent.com loads successfully

✅ **Local development working**: API routes work correctly in local development

⚠️ **Cloudflare deployment**: API routes need Cloudflare Dashboard deployment with Next.js preset (manual wrangler deployment has compatibility issues)

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

## Debugging Steps

**If you're seeing 500 errors on API routes:**

1. Check Cloudflare Dashboard → Errors & Logs for runtime errors
2. Try deploying via the Dashboard with Next.js preset instead of Wrangler
3. Verify all environment variables are set correctly in Dashboard → Settings → Environment Variables
4. Test with `wrangler pages dev .vercel/output/static` locally to see runtime errors

**Root Cause Identified:**
```
Error: No such module "__next-on-pages-dist__/functions/api/async_hooks"
```

`@cloudflare/next-on-pages` attempts to import `async_hooks` which is not supported in Cloudflare's Edge runtime, even with `nodejs_compat` flag. This is a known limitation in the `@cloudflare/next-on-pages` adapter.

**Solution:**
Deploy via Cloudflare Dashboard with the Next.js preset (see Solution 1 above). This bypasses the adapter and uses Cloudflare's native Next.js support.

**Note:** API routes work perfectly in local dev (`localhost:3000`), confirming the issue is specific to the `@cloudflare/next-on-pages` deployment on Cloudflare Pages.

