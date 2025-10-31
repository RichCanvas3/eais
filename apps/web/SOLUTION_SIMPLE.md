# Simple Solution: Cloudflare Pages 404 Fix

## The Real Issue

You're deploying the **wrong directory**.

Cloudflare Pages doesn't know your `.next` directory contains a Next.js App Router app.

## Quick Fix (No Code Changes Needed)

### Step 1: Check Cloudflare Dashboard

1. Go to: https://dash.cloudflare.com/
2. Pages → erc8004-web → Settings → Builds & deployments
3. **Look at "Framework preset"** 
   - What does it say?
   - If it's blank or "Other" → That's the problem!
   - If it says "Next.js" → Different problem

### Step 2: Update Framework Preset

1. Click **Edit** on Build configuration
2. Find "Framework preset"
3. Select **"Next.js"** from dropdown
4. Save
5. Retry deployment

### Step 3: Verify Output Directory

In the same settings:
- Build output directory should be `.next`
- Root directory should be `apps/web`
- Build command should match what we documented

## If Framework Preset is Already "Next.js"

Then the issue is different. Check:
1. Latest deployment status (Success/Failed?)
2. Build logs for errors
3. Whether deployment is actually completing

## Alternative: Use New Build Method

If dashboard won't work:

```bash
cd /home/barb/erc8004/erc-8004-identity-indexer
pnpm build:sdks
cd apps/web
pnpm build:cloudflare
```

This creates `.vercel/output/static/` that Cloudflare understands.

Then update `wrangler.toml`:
```toml
pages_build_output_dir = ".vercel/output/static"
```

Then deploy:
```bash
cd /home/barb/erc8004/erc-8004-identity-indexer/apps/web
./deploy-to-cloudflare.sh
```

But you'd need to update the script to use `.vercel/output/static` instead of `.next`.

## What I Need From You

**PLEASE**: Go to Cloudflare Dashboard and tell me:
1. What does "Framework preset" say?
2. What does the latest deployment status show?
3. Are there any errors in the build logs?

This will tell us exactly what's wrong!

## Most Likely Fix

Framework preset is wrong. Once you set it to "Next.js" and retry deployment, it should work.

