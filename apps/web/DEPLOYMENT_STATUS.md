# Cloudflare Pages Deployment Status

## Current Status

✅ **Homepage**: https://www.8004-agent.com loads successfully  
❌ **API Routes**: All API routes return 500 Internal Server Error

## Root Cause

`@cloudflare/next-on-pages` is attempting to import `async_hooks` which is not available in Cloudflare's Edge Runtime, even with `nodejs_compat` flag enabled. This is evidenced by the error:

```
Error: No such module "__next-on-pages-dist__/functions/api/async_hooks"
```

## Test Results

### Local Development
- ✅ All API routes work: `localhost:3000/api/agents`, `localhost:3000/api/stats`, etc.
- ✅ GraphQL queries work correctly
- ✅ Edge runtime functions properly

### Cloudflare Pages (via next-on-pages)
- ✅ Homepage loads
- ❌ All API routes return 500
- ❌ Even simplest possible Edge route fails
- ❌ `wrangler pages dev` shows the `async_hooks` error

## API Routes Affected

1. `/api/agents` - Returns agent list from GraphQL
2. `/api/agents/[agentId]` - Returns individual agent details
3. `/api/stats` - Returns statistics aggregated from GraphQL
4. `/api/discover` - AI-powered agent discovery
5. `/api/graph-layout` - Graph layout computation
6. `/api/proxy` - CORS proxy endpoint

## Solutions

### Option 1: Cloudflare Dashboard Build (Recommended)
Deploy via the dashboard using the built-in Next.js integration:

1. Go to Cloudflare Dashboard → Pages → Settings
2. Framework preset: **Next.js**
3. Root directory: `apps/web`
4. Build command: `cd ../.. && pnpm install && pnpm build:sdks && NODE_ENV=production pnpm --filter erc8004-web build`
5. Output directory: `.next`
6. Environment variables: See `QUICK_START.md`

This bypasses `next-on-pages` entirely and uses Cloudflare's native Next.js support.

### Option 2: Wait for next-on-pages fix
The `async_hooks` issue is a known limitation/bug in the current version. Check for updates:
- https://github.com/cloudflare/next-on-pages
- https://developers.cloudflare.com/pages/

### Option 3: Remove API routes (not recommended)
If API routes aren't critical, use static export mode:
```javascript
// next.config.mjs
export default {
  output: 'export',
  // ... rest
}
```
This disables all server-side functionality.

## Environment Variables Required

See `QUICK_START.md` for complete list. Key ones:
- `GRAPHQL_API_URL` - Hardcoded to `https://erc8004-indexer-graphql.richardpedersen3.workers.dev/graphql`
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX`
- And many others...

## Notes

- API routes work perfectly in local dev
- GraphQL endpoint is working and accessible
- Issue is 100% related to `@cloudflare/next-on-pages` Edge runtime compatibility
- `nodejs_compat` flag doesn't help - `async_hooks` isn't supported

