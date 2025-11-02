# ERC-8004 Indexer

## Overview

This folder currently includes a subgraph based indexing stack for local and remote development. Please refer to the /subgraph/README.md doc for more info.

## Setup

### Local Development

**Environment Variables Required:**
The indexer now uses Cloudflare D1 for both local and production. You need to set:
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `CLOUDFLARE_D1_DATABASE_ID` - Your D1 database ID  
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with D1 permissions

1. Copy env:
  ```bash
  cp .env.example .env
  ```
2. Install deps from repo root:
  ```bash
  pnpm install
  ```
3. Set D1 credentials in `.env` file

### Run Local GraphQL Server
```bash
pnpm dev:graphql
# or
pnpm start:graphql
```
GraphiQL UI available at: http://localhost:4000/graphql

## Deployment to Cloudflare

### Prerequisites
1. Install Wrangler CLI (if not already installed):
   ```bash
   pnpm add -D wrangler
   ```
2. Authenticate with Cloudflare:
   ```bash
   npx wrangler login
   ```

### Initial Setup

1. **Create D1 Database** (if not already created):
   ```bash
   cd apps/indexer
   pnpm d1:create
   ```
   Note the database name and add it to `wrangler.toml` under `[[d1_databases]]`.

2. **Run Migrations**:
   ```bash
   # Initial schema
   pnpm d1:migrate
   
   # Access codes table (if needed)
   wrangler d1 execute erc8004-indexer --remote --file=./migrations/0002_add_access_codes.sql
   ```

3. **Set Environment Variables**:
   ```bash
   # Secret access code for server-to-server authentication
   wrangler secret put GRAPHQL_SECRET_ACCESS_CODE
   ```
   Enter your secret access code when prompted (this will be used by the web app).

### Deploy

From the `apps/indexer` directory:

**Production:**
```bash
# Using npm script
pnpm deploy

# Or directly with wrangler
npx wrangler deploy

# Or using pnpm
pnpm exec wrangler deploy
```

**Development Environment:**
```bash
# Using npm script
pnpm deploy:dev

# Or directly with wrangler
npx wrangler deploy --env development
```

This will deploy the GraphQL API to Cloudflare Workers. The endpoint URL will be shown in the output after successful deployment (e.g., `https://erc8004-indexer-graphql.your-subdomain.workers.dev`).

### Environment Variables

Set these in Cloudflare Workers dashboard or via Wrangler:
- `GRAPHQL_SECRET_ACCESS_CODE` - Secret access code for server-to-server auth (set via `wrangler secret put`)

### Local Worker Development
```bash
# Run worker locally with D1
pnpm dev:worker:local

# Run worker connected to remote D1
pnpm dev:worker
```

## Notes
- **Database**: Uses Cloudflare D1 for both local development and production
- **Local Development**: Requires D1 configuration (CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN) in `.env`
- **Local D1**: Use `pnpm dev:worker:local` for local D1 (managed by Wrangler), or configure remote D1 credentials
- Reads chain via `RPC_HTTP_URL`; optional `RPC_WS_URL`
- GraphQL API requires access code authentication (except for `getAccessCode` and `createAccessCode` mutations)
- Use `GRAPHQL_SECRET_ACCESS_CODE` environment variable for server-to-server authentication