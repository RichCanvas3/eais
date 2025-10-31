# Deployment Status Check

## Current Status: ❌ NOT DEPLOYED

The default Cloudflare Pages domain returns 404, which means:
- No deployment exists, OR
- Project name is wrong, OR
- Deployment failed

## Fix: Deploy Now

### Step 1: Check if Project Exists

```bash
wrangler pages project list
```

Look for `erc8004-web` in the list.

### Step 2: Build the Project

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

### Step 3: Deploy

**Option A: Use Deployment Script**

```bash
cd apps/web
chmod +x deploy-to-cloudflare.sh
./deploy-to-cloudflare.sh
```

**Option B: Manual Wrangler Deploy**

```bash
cd apps/web
wrangler pages deploy .next --project-name=erc8004-web
```

### Step 4: Verify Deployment

After deployment, check:

```bash
curl -I https://erc8004-web.pages.dev
```

Should return `HTTP/2 200` not `404`.

## If Deployment Fails

### Build Errors

Check for:
- Missing environment variables (set in dashboard)
- SDK build errors
- File size > 25MB
- Missing dependencies

### Authentication Errors

```bash
wrangler login
```

### Project Name Wrong

If project has different name:
```bash
wrangler pages deploy .next --project-name=YOUR_PROJECT_NAME
```

## After Successful Deployment

1. ✅ Verify: https://erc8004-web.pages.dev works
2. ✅ Configure custom domain: www.8004-agent.com
3. ✅ Set environment variables
4. ✅ Test site functionality

## Quick Checklist

- [ ] Built SDKs successfully
- [ ] Built web app successfully
- [ ] Deployed to Cloudflare Pages
- [ ] Default domain works
- [ ] Custom domain configured
- [ ] Environment variables set
- [ ] Site loads without errors

## Still Having Issues?

Check these files:
- `QUICK_START.md` - Step by step deployment
- `CUSTOM_DOMAIN_SETUP.md` - Domain configuration
- `FINAL_DEPLOYMENT_GUIDE.md` - Complete guide

