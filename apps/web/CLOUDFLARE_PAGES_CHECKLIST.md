# Cloudflare Pages Deployment Checklist

## ✅ What We've Confirmed

1. **Build Output Exists**: `.next` directory with valid HTML files
2. **Deployment Uploads**: Wrangler successfully uploads 112 files
3. **Project Exists**: `erc8004-web` project is configured
4. **Custom Domain**: `www.8004-agent.com` is attached

## ❌ Current Issue

**All deployments return 404**, even though:
- Files are uploaded successfully
- `index.html` exists and is valid
- Build output looks correct

## 🔍 Diagnosis Steps

### Step 1: Check Cloudflare Dashboard Build Logs

Go to:
```
https://dash.cloudflare.com/[YOUR_ACCOUNT_ID]/pages/view/erc8004-web/[LATEST_DEPLOYMENT_ID]
```

Look for:
- ❌ Build errors
- ❌ "Page not found" during build
- ❌ Framework detection issues
- ❌ Environment variable warnings

### Step 2: Check Build Configuration in Dashboard

In **Cloudflare Pages Dashboard** → **Settings** → **Builds & deployments**:

**Verify**:
- ✅ Framework preset: **Next.js**
- ✅ Root directory: `apps/web`
- ✅ Build command: matches what we've documented
- ✅ Build output directory: `.next`

**Problem**: If framework preset is wrong or missing, Pages won't know how to serve Next.js files.

### Step 3: Check Function Compatibility

Next.js 14 with App Router might need special configuration for Cloudflare.

**Options**:

#### Option A: Use Next.js Compatibility Layer
Cloudflare has beta support for Next.js on Pages. Check if you need:
- `compatibility_flags = ["nodejs_compat"]` in `wrangler.toml`
- Or specific Next.js adapter

#### Option B: Static Export
Generate static HTML instead:
```javascript
// next.config.mjs
export default {
  output: 'export', // Force static export
  // ... rest of config
}
```

### Step 4: Verify Environment Variables

Even though upload succeeds, runtime might fail due to missing env vars.

**Check**: In Cloudflare Dashboard → Environment Variables, verify all are set.

## 🚀 Quick Fix Attempts

### Fix 1: Update Wrangler TOML

```toml
# wrangler.toml
name = "erc8004-web"
compatibility_date = "2024-01-01"

# Try adding compatibility flags
compatibility_flags = ["nodejs_compat"]

# Output directory
pages_build_output_dir = ".next"
```

### Fix 2: Check Framework Detection

In Cloudflare Dashboard, ensure:
1. Go to **Settings** → **Builds & deployments**
2. Verify **Framework preset** shows "Next.js"
3. If blank or wrong, manually select "Next.js"
4. Click "Save"
5. Trigger a new deployment

### Fix 3: Try Manual Deployment via Dashboard

Instead of Wrangler CLI:
1. Go to Cloudflare Dashboard
2. Pages → erc8004-web → Deployments
3. Click "Retry deployment" on latest
4. Or upload a ZIP of `.next` directory

## 🔬 Advanced Debugging

### Check What Cloudflare Actually Deployed

```bash
# Download deployed files
wrangler pages deployment tail --project-name=erc8004-web
```

### Check Runtime Logs

```bash
# View real-time logs
wrangler pages deployment tail --project-name=erc8004-web --format=pretty
```

### Check Function Logs

If Next.js tries to run server-side:
1. Go to Cloudflare Dashboard
2. Pages → erc8004-web → Functions
3. Check for errors

## 📋 Most Likely Issues

Based on symptoms (upload succeeds, 404 errors):

### Issue #1: Framework Not Detected
**Symptom**: Cloudflare doesn't recognize it as Next.js  
**Fix**: Manually set framework preset to "Next.js"

### Issue #2: Static Export Needed
**Symptom**: Server-side rendering not supported  
**Fix**: Add `output: 'export'` to next.config.mjs

### Issue #3: Build Output Wrong
**Symptom**: Files in wrong location  
**Fix**: Verify `pages_build_output_dir` is `.next` not `.next/static`

### Issue #4: Runtime Error
**Symptom**: Files exist but runtime fails  
**Fix**: Check Cloudflare Functions/Workers logs

## 🎯 Next Steps

**PRIORITY 1**: Check Cloudflare Dashboard build logs  
**PRIORITY 2**: Verify framework preset is set to "Next.js"  
**PRIORITY 3**: Try adding `compatibility_flags = ["nodejs_compat"]`

**Please**:
1. Open Cloudflare Dashboard
2. Go to your latest deployment
3. Share the build logs
4. Check Settings → Framework preset

This will tell us exactly what's wrong!

