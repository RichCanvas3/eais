# Immediate Fix: Deploy Working Build

## Problem

All deployments return 404, indicating either:
1. Build output is empty/corrupted
2. Build output directory is wrong
3. Build failed silently

## Solution: Fresh Deployment

### Step 1: Check Current Build

```bash
cd /home/barb/erc8004/erc-8004-identity-indexer/apps/web
ls -la .next 2>/dev/null || echo "No .next directory"
```

### Step 2: Rebuild Everything

```bash
# From project root
cd /home/barb/erc8004/erc-8004-identity-indexer

# Install dependencies
pnpm install

# Build SDKs
pnpm build:sdks

# Build web app
NODE_ENV=production pnpm --filter erc8004-web build
```

### Step 3: Verify Build Output

```bash
cd apps/web
ls -la .next/static 2>/dev/null || echo "No static files"
ls -la .next/server 2>/dev/null || echo "No server files"
```

**Should see files in both directories!**

### Step 4: Deploy

```bash
cd apps/web
./deploy-to-cloudflare.sh
```

Or manually:
```bash
wrangler pages deploy .next --project-name=erc8004-web
```

### Step 5: Verify Deployment

Wait ~2 minutes, then:
```bash
curl -I https://erc8004-web.pages.dev
```

Should return `HTTP/2 200`, not `404`.

## If Build Directory is Empty

### Problem: Build output directory wrong

**Current config**: `pages_build_output_dir = ".next"` in `wrangler.toml`

**Check if this is the issue**:
```bash
cd apps/web
ls -la .next/
```

If empty or missing critical files → build failed

### Common Build Failures

1. **SDK build failed**
   - Check: Did `pnpm build:sdks` succeed?
   - Fix: Ensure workspace dependencies are linked

2. **TypeScript errors**
   - Check: Did `pnpm --filter erc8004-web build` show errors?
   - Fix: Resolve TypeScript errors

3. **Missing dependencies**
   - Check: Are SDK packages built?
   - Fix: Run `pnpm build:sdks` first

4. **Environment variables missing**
   - Check: Build might need env vars
   - Fix: Set them in Cloudflare or `.env.local`

## Alternative: Check Cloudflare Dashboard

1. Go to: https://dash.cloudflare.com/
2. Pages → erc8004-web → Deployments
3. Click on latest deployment
4. Check **Build logs**

Look for:
- ❌ Build errors
- ❌ File size warnings
- ❌ Missing files
- ✅ Build succeeded messages

## If Dashboard Shows Failed Build

### Check Build Logs For:

1. **"Could not find 'next' module"**
   - Fix: Ensure `pnpm install` ran successfully

2. **"File size > 25MB"**
   - Fix: Run `./deploy-to-cloudflare.sh` script

3. **"Module not found: '@erc8004/sdk'"**
   - Fix: Run `pnpm build:sdks` first

4. **"Command failed with exit code 1"**
   - Fix: Check the actual error message above this line

## Nuclear Option: Wipe and Rebuild

If nothing works:

```bash
# Clean everything
cd /home/barb/erc8004/erc-8004-identity-indexer
rm -rf apps/web/.next
rm -rf node_modules
rm -rf apps/*/node_modules

# Reinstall
pnpm install

# Rebuild
pnpm build:sdks
NODE_ENV=production pnpm --filter erc8004-web build

# Deploy
cd apps/web
./deploy-to-cloudflare.sh
```

## Success Criteria

✅ Build completes without errors
✅ `.next/static` has files
✅ `.next/server` has files
✅ Deployment shows success in Cloudflare
✅ `https://erc8004-web.pages.dev` returns 200
✅ `https://www.8004-agent.com` returns 200

## Next Steps After Successful Deploy

1. Set environment variables
2. Verify site works
3. Test login
4. Check agent table

## Need Help?

- Check build logs in Cloudflare dashboard
- Run deployment locally to see errors
- Check `QUICK_START.md` for step-by-step guide

