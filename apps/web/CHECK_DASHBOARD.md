# Check Cloudflare Dashboard NOW

## Critical Issue

Your deployments are returning 404. The most likely cause is **incorrect configuration in the Cloudflare Dashboard**.

## What You Need to Check

Go to: **https://dash.cloudflare.com/** → **Pages** → **erc8004-web**

### 1. Check Build Configuration

Click **Settings** → **Builds & deployments**:

Look for these fields:
- **Framework preset**: What does it say?
  - Should be: "Next.js"
  - If it's "Other" or blank → **THIS IS THE PROBLEM**
  
- **Root directory**: Should be `apps/web`
- **Build command**: Should match what we documented
- **Build output directory**: Should be `.next`

### 2. Check Latest Deployment

Click **Deployments** tab:

Look at the **latest deployment**:
- Status: Success, Failed, or Building?
- If Failed: What's the error message?

Click on the deployment to see build logs.

### 3. Check Environment Variables

Settings → **Environment variables**:

Are all the required variables set?
- NEXT_PUBLIC_WEB3AUTH_CLIENT_ID
- NEXT_PUBLIC_ETH_SEPOLIA_*
- GRAPHQL_API_URL

## Most Likely Problem

**Framework preset is NOT set to "Next.js"**

When Cloudflare builds from Git but doesn't detect Next.js, it:
1. Runs the build command
2. Gets `.next` directory
3. Doesn't know how to serve it
4. Returns 404 for all routes

## The Fix

1. Go to Settings → Builds & deployments
2. Click "Edit" or "Edit configuration"
3. Find "Framework preset"
4. Select **"Next.js"** from dropdown
5. Save
6. Go to Deployments
7. Click "Retry deployment" on latest one
8. Wait for build
9. Test site

## Quick Check Command

Run this to see deployment status:

```bash
wrangler pages deployment list --project-name=erc8004-web
```

Look at the "Status" column. If it's blank, the deployment may have failed silently.

## Next Steps

**SHARE WITH ME**:
1. Screenshot of Build configuration in dashboard
2. Latest deployment build logs
3. Any errors you see

This will tell us exactly what's wrong!

