# Cloudflare Pages Startup Issues - Immediate Fixes

## 🔴 CRITICAL ISSUE: API Routes Using Node.js Dependencies

### Problem
Your API routes are importing from `../../../../indexer/src/db` which:
1. Uses `better-sqlite3` (Node.js native module)
2. Uses Node.js `fs` and `path` modules
3. Doesn't work on Cloudflare Pages edge runtime

**Affected Routes**:
- `/api/agents`
- `/api/stats`
- `/api/agents/[agentId]`

### Why It Prevents Startup

When these routes are accessed (even during build or initial page load), they try to:
1. Import `better-sqlite3` → **FAILS** (not available on edge)
2. Import `fs` module → **FAILS** (not available on edge)
3. Initialize database → **FAILS** (can't use Node.js APIs)

This causes the entire site to fail at startup.

## ✅ Quick Fix Options

### Option 1: Temporarily Disable API Routes (Fastest)

Comment out the database imports and return empty data:

```typescript
// apps/web/app/api/agents/route.ts
import { NextResponse } from 'next/server';
// import { db } from '../../../../indexer/src/db'; // DISABLED for Cloudflare

export async function GET(req: Request) {
  // Temporarily return empty data until database is configured
  return NextResponse.json({ rows: [], total: 0, page: 1, pageSize: 50 });
}
```

### Option 2: Use Your GraphQL Server (Recommended)

Point API routes to your existing GraphQL endpoint:

```typescript
// apps/web/app/api/agents/route.ts
import { NextResponse } from 'next/server';

const GRAPHQL_URL = process.env.GRAPHQL_API_URL || 'https://your-graphql-worker.workers.dev/graphql';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = `
      query GetAgents($page: Int, $pageSize: Int) {
        agents(page: $page, pageSize: $pageSize) {
          rows { chainId, agentId, agentName }
          total
        }
      }
    `;
    
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { page: 1, pageSize: 50 } })
    });
    
    const data = await res.json();
    return NextResponse.json(data.data.agents);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
```

### Option 3: Use D1 HTTP API

If you have a Cloudflare D1 database, use the HTTP API:

```typescript
const D1_API_URL = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

export async function GET(req: Request) {
  const query = 'SELECT * FROM agents LIMIT 50';
  const res = await fetch(D1_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sql: query })
  });
  // ...
}
```

## 🚨 Immediate Action Required

1. **Check Cloudflare Pages Build Logs**:
   - Go to your Pages project → Deployments → Latest
   - Look for errors mentioning:
     - "better-sqlite3"
     - "Module not found"
     - "Cannot find module"
     - "ERR_MODULE_NOT_FOUND"

2. **Check Runtime Logs**:
   - Cloudflare Pages dashboard → Functions → Logs
   - Or check browser console for 500 errors

3. **Quick Test**:
   - Try accessing `https://your-site.pages.dev/api/stats`
   - If it returns 500 or crashes, that's the issue

## 📋 Environment Variables Check

Ensure these are set in Cloudflare Pages:

### Required for App Startup:
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX`

### Required for Database (if using Option 3):
- `USE_D1=true`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_API_TOKEN`

### Optional:
- `GRAPHQL_API_URL` (if using Option 2)
- `OPENAI_API_KEY` (for discover/graph features)

## 🔧 Next Steps

1. **Immediate**: Comment out database imports in API routes
2. **Short-term**: Point API routes to your GraphQL server
3. **Long-term**: Migrate API routes to Cloudflare Workers Functions

