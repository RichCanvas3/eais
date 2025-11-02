# Indexer GraphQL Architecture

## Why Two Implementations?

### 1. **Runtime Differences**

**Local (`graphql.ts` + `graphql-server.ts`)**:
- Runs on **Node.js** using **Express.js**
- Uses **D1 Database Adapter** (`db-d1.ts`) that wraps Cloudflare D1 API calls via HTTP
- Database interface: `db.prepare(sql).all(...params)` - positional parameters

**Production (`worker.ts` + `worker-db.ts`)**:
- Runs on **Cloudflare Workers** (V8 isolate, not Node.js)
- Uses **Native D1** directly via `env.DB`
- Database interface: `db.prepare(sql).bind(...params).all()` - bound parameters
- **Cannot use Express.js** - must use Workers Fetch API

### 2. **What Must Stay Separate**

- **Server setup**: Express.js middleware vs Workers `fetch()` handler
- **Request/Response handling**: Express `req/res` objects vs Workers `Request/Response`
- **Environment access**: `process.env` vs `env` object passed to handler

### 3. **What Can Be Shared** (Now Unified!)

✅ **GraphQL Schema** - Same schema definition  
✅ **Resolver Logic** - Same database queries and business logic  
✅ **Helper Functions** - WHERE clause builder, ORDER BY builder, etc.  
✅ **Database Queries** - Unified executors handle both D1 adapter and native D1

## Current Unified Components

### `graphql-schema.ts`
- Shared GraphQL schema string
- Can be imported by both implementations

### `graphql-resolvers.ts`
- **Unified resolver functions** that work with both:
  - D1 adapter (local Node.js)
  - Native D1 (Cloudflare Workers)
- Automatically detects which interface is being used
- Provides `executeQuery`, `executeQuerySingle`, `executeUpdate` helpers

## Next Steps: Refactor Both to Use Shared Code

### For `graphql.ts`:
```typescript
import { graphQLSchema } from './graphql-schema';
import { createGraphQLResolvers } from './graphql-resolvers';
// ... use shared schema and resolvers
```

### For `worker.ts` / `worker-db.ts`:
```typescript
import { graphQLSchema } from './graphql-schema';
import { createGraphQLResolvers } from './graphql-resolvers';
// ... use shared schema and resolvers
```

This eliminates code duplication while maintaining runtime-specific server handling.

## Benefits

1. **Single Source of Truth**: Schema and resolver logic defined once
2. **Easier Maintenance**: Bug fixes and features added in one place
3. **Consistency**: Both local and production behave identically
4. **Type Safety**: Shared types ensure compatibility

## Remaining Differences

These **must** remain separate due to runtime constraints:

1. **Authentication middleware**: Express vs Workers
2. **GraphiQL HTML**: Slightly different due to runtime constraints
3. **CORS handling**: Express middleware vs Workers headers
4. **Error responses**: Express `res.status()` vs Workers `Response` constructor

