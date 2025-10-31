# Deployment Size Fix

## Changes Made

### 1. Enhanced Code Splitting
Updated `next.config.mjs` to aggressively split large dependencies:
- `ethers` - separate chunk
- `viem` - separate chunk  
- `@web3auth/*` - separate chunk
- `@mui/*` - separate chunk
- Common dependencies - shared chunk

This prevents any single file from exceeding 25MB.

### 2. Enhanced Cleanup Script
Updated `deploy-to-cloudflare.sh` to:
- Remove more cache directories (`.cache`, `cache/webpack/*`)
- Remove standalone build artifacts
- Remove compressed files (`.gz`, `.br`)
- Show size breakdown before deployment
- Automatically attempt to remove files over 25MB if they're cache files

### 3. Updated `.cfignore`
Added patterns to exclude:
- Standalone build artifacts
- Serverless function bundles
- Compressed chunk files

## How to Deploy

1. **Build the project**:
   ```bash
   cd ../..
   pnpm build:sdks
   NODE_ENV=production pnpm --filter erc8004-web build
   ```

2. **Run the deployment script**:
   ```bash
   cd apps/web
   ./deploy-to-cloudflare.sh
   ```

The script will:
- Clean all cache files
- Remove source maps
- Remove large build artifacts
- Show size breakdown
- Check for files over 25MB
- Attempt automatic cleanup
- Deploy to Cloudflare Pages

## If Still Too Large

If you still get the 25MB error, check the output for:
- Which specific file is over 25MB
- Where it's located (likely in `.next/static/chunks/`)

### Manual Cleanup Options

1. **Exclude large chunks manually**:
   ```bash
   find .next/static/chunks -type f -size +10M -delete
   ```

2. **Check bundle analyzer** (if you add it):
   ```bash
   ANALYZE=true pnpm --filter erc8004-web build
   ```

3. **Remove specific large dependencies** temporarily to identify the culprit

## Expected Sizes

After cleanup:
- `.next/static` - should be ~15-20MB (split into many chunks < 1MB each)
- `.next/server` - should be minimal for edge runtime
- Total `.next` - should be under 50MB

## Troubleshooting

### "File X is over 25MB"
1. Check if it's a cache file → should be auto-removed
2. Check if it's a source map → should be auto-removed
3. If it's a chunk file, the code splitting should prevent this
4. If it's a dependency, consider:
   - Dynamic imports for that library
   - Excluding it from the bundle
   - Using a lighter alternative

### Large Bundle Sizes
- Verify `NODE_ENV=production` is set during build
- Check that `productionBrowserSourceMaps: false` is working
- Ensure tree shaking is working (check bundle for unused code)
- Consider lazy loading components that use large libraries

