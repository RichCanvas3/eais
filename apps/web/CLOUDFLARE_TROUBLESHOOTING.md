# Cloudflare Pages Startup Troubleshooting

## Common Issues Preventing Startup

### 1. ❌ Database Access Issue (CRITICAL)

**Problem**: API routes import from `../../../../indexer/src/db` which uses:
- `better-sqlite3` (Node.js native module - doesn't work on Cloudflare edge)
- Direct D1 database access via `wrangler` bindings

**Impact**: API routes (`/api/agents`, `/api/stats`, `/api/agents/[agentId]`) will fail at startup or runtime.

**Solution Options**:

#### Option A: Use Cloudflare Workers Functions (Recommended)
- Move API routes to Cloudflare Workers Functions
- Access D1 database through Workers bindings
- Configure Workers in `wrangler.toml`:

```toml
[functions]
directory = "functions"

[[functions.routes]]
pattern = "/api/*"
```

#### Option B: Use HTTP API Gateway
- Create a separate Cloudflare Worker for the GraphQL API
- Have Pages API routes call the Worker via HTTP
- Example: `fetch('https://graphql.your-domain.com')`

#### Option C: Convert to Edge-compatible Database
- Use Cloudflare D1 via HTTP API
- Use fetch to query D1 from Pages
- Requires D1 HTTP API endpoint

### 2. ✅ File System Access Issue (RESOLVED)

**Status**: `/api/agent-cards` route has been removed. Agent cards are now stored client-side only.

### 3. ⚠️ Missing Environment Variables

**Problem**: Missing `NEXT_PUBLIC_*` environment variables cause runtime errors.

**Impact**: App crashes on startup if required env vars are missing.

**Check**: Ensure all these are set in Cloudflare Pages dashboard:
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER`
- `NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY`
- `NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL`
- Plus Base Sepolia and OP Sepolia variables if needed

### 4. ⚠️ Node.js APIs Not Available

**Problem**: Using Node.js-specific APIs in edge runtime:
- `fs` (file system)
- `path` (some functions)
- `better-sqlite3` (native modules)
- Other Node.js built-ins

**Impact**: Runtime errors when code executes.

**Solution**: Use Web APIs or Cloudflare-specific APIs:
- Use `fetch` instead of Node.js HTTP
- Use Cloudflare KV/R2 instead of filesystem
- Use D1 HTTP API instead of direct SQLite

### 5. ⚠️ Next.js Configuration for Cloudflare

**Problem**: Missing Cloudflare-specific Next.js configuration.

**Solution**: Add runtime configuration to `next.config.mjs`:

```javascript
const nextConfig = {
  // ... existing config ...
  
  // Cloudflare Pages specific
  output: 'standalone', // Optional: for optimized builds
  
  // Ensure API routes work on edge
  experimental: {
    // ... existing experimental options ...
    serverComponentsExternalPackages: ['better-sqlite3'], // Exclude from bundle
  },
};
```

### 6. ⚠️ Build Output Issues

**Problem**: Incorrect build output directory or missing files.

**Check**:
- Build output directory should be `.next`
- Ensure `.next/standalone` or `.next/static` exists after build
- Check Cloudflare Pages build logs for errors

### 7. ⚠️ Import Errors

**Problem**: Importing modules that don't work on edge runtime.

**Check build logs** for errors like:
- "Module not found"
- "Cannot find module"
- "Dynamic require is not supported"

## Immediate Fixes Needed

### Priority 1: Database Access

The API routes need to be refactored to work with Cloudflare's edge runtime:

**Current (Won't Work)**:
```typescript
import { db } from '../../../../indexer/src/db';
```

**Needs to be**:
- HTTP calls to a Worker with D1 access, OR
- D1 HTTP API calls, OR
- Move API routes to Cloudflare Workers Functions

### Priority 2: File System

**Current (Won't Work)**:
```typescript
import * as fs from 'fs';
fs.readFileSync(...);
```

**Needs to be**:
- Cloudflare KV storage
- Cloudflare R2 storage
- Or remove this feature for Pages deployment

### Priority 3: Environment Variables

Ensure all `NEXT_PUBLIC_*` variables are set in Cloudflare Pages dashboard.

## Quick Diagnostic Steps

1. **Check Cloudflare Pages Build Logs**:
   - Go to your Pages project → Deployments → Latest deployment
   - Check for build errors or warnings

2. **Check Runtime Logs**:
   - Go to Functions → Logs (if using Functions)
   - Or check browser console for errors

3. **Test API Routes**:
   - Try accessing `/api/stats` directly
   - Check for 500 errors or timeouts

4. **Check Environment Variables**:
   - Verify all required vars are set
   - Check for typos in variable names

## Recommended Architecture

For Cloudflare Pages deployment:

```
┌─────────────────────┐
│  Cloudflare Pages   │  ← Next.js frontend
│   (Static/Edge)     │
└──────────┬──────────┘
           │ HTTP/GraphQL
           ▼
┌─────────────────────┐
│ Cloudflare Workers  │  ← API endpoints
│   (with D1 bind)    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   Cloudflare D1     │  ← Database
│    (SQLite)         │
└─────────────────────┘
```

**Alternative**: Use your existing GraphQL server (if it's already on Cloudflare Workers).

## Next Steps

1. **Move API routes to Workers** (best solution)
2. **Replace file system with KV/R2**
3. **Set all environment variables**
4. **Test locally with `wrangler pages dev`**

