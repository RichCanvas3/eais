# Final Cloudflare Pages Deployment Guide

## Critical Issues Fixed

1. ✅ **API Routes** - Refactored to use GraphQL HTTP instead of Node.js-only modules
2. ✅ **Build Size** - Added aggressive code splitting and cleanup
3. ✅ **Environment Variables** - Documented all required variables

## Deployment Methods

### Method 1: Via Cloudflare Dashboard (Easiest)

1. **Go to Cloudflare Dashboard** → Pages → Create Project
2. **Connect Git Repository**
3. **Configure Build Settings**:
   - **Framework**: Next.js
   - **Root directory**: `apps/web`
   - **Build command**:
     ```bash
     cd ../.. && pnpm install && pnpm build:sdks && NODE_ENV=production pnpm --filter erc8004-web build
     ```
   - **Build output directory**: `.next` ← **CRITICAL**
   - **Node version**: 18 or 20

4. **Set Environment Variables** (see ENV_CHECKLIST.md)
   - **MUST SET**: `GRAPHQL_API_URL`
   - **MUST SET**: All `NEXT_PUBLIC_ETH_SEPOLIA_*` variables
   - **MUST SET**: `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`

5. **Deploy**

### Method 2: Via Wrangler CLI

1. **Build**:
   ```bash
   pnpm build:sdks
   NODE_ENV=production pnpm --filter erc8004-web build
   ```

2. **Deploy**:
   ```bash
   cd apps/web
   ./deploy-to-cloudflare.sh
   ```

Or manually:
```bash
cd apps/web
wrangler pages deploy .next --project-name=erc8004-web
```

## Common Issues & Solutions

### Issue: "Pages only supports files up to 25 MiB"
**Solution**: The deploy script automatically removes large files. If still fails:
1. Check which file is over 25MB in the error
2. If it's a chunk file, the code splitting should have prevented this
3. Manually delete it and redeploy

### Issue: Site loads but shows no agent data
**Solution**: Set `GRAPHQL_API_URL` environment variable

### Issue: Web3Auth not working
**Solution**: Verify `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` is set correctly

### Issue: ENS features not working
**Solution**: Verify all `NEXT_PUBLIC_ETH_SEPOLIA_*` variables are set

## Build Output Directory

**IMPORTANT**: Use `.next` NOT `.next/static` or `.next/server`

Cloudflare Pages expects the full `.next` directory because it contains:
- Static assets (`.next/static/`)
- Server components (`.next/server/`)
- API routes (`.next/server/app/api/`)
- Route manifests

## Verifying Deployment

1. **Check Build Logs**: Look for errors or warnings
2. **Visit Site**: Should load without errors
3. **Check Console**: Should see no missing env var warnings
4. **Test Login**: Web3Auth should work
5. **Test Agent Table**: Should show agents (if GraphQL is configured)

## Environment Variables Summary

### Required for Site to Start
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER`
- `NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY`
- `GRAPHQL_API_URL`

### Required for Full Features
- All other `NEXT_PUBLIC_ETH_SEPOLIA_*` variables
- Base Sepolia variables (optional)
- OP Sepolia variables (optional)

See `ENV_CHECKLIST.md` for the complete list.

## Architecture

```
Cloudflare Pages (Edge Runtime)
├── Static Assets (.next/static/)
├── API Routes (.next/server/app/api/)
│   ├── /api/agents → fetches from GraphQL
│   ├── /api/stats → fetches from GraphQL
│   └── /api/agents/[id] → fetches from GraphQL
└── Edge Functions
    └── All use HTTP fetch (no Node.js modules)

HTTP → Cloudflare Worker (GraphQL)
└── Cloudflare D1 (Indexer Data)
```

## Next Steps After Deployment

1. ✅ Set all environment variables
2. ✅ Test the deployed site
3. ✅ Monitor build logs
4. ✅ Fix any runtime errors
5. ✅ Test all features

## Need Help?

Check these files:
- `ENV_CHECKLIST.md` - Quick checklist
- `ENV_AUDIT.md` - Environment variable audit
- `CLOUDFLARE_TROUBLESHOOTING.md` - Detailed troubleshooting
- `DEPLOYMENT_SIZE_FIX.md` - Size optimization details

