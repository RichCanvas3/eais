# Quick Guide: Deploy GraphQL API to Cloudflare Workers

This is a quick deployment guide for the GraphQL API. For detailed instructions, see `CLOUDFLARE_DEPLOY.md`.

## Prerequisites

1. **Wrangler CLI** (already installed via package.json)
2. **Cloudflare Account** - logged in via `wrangler login`

## Quick Deployment Steps

**⚠️ Important**: You must run deployment commands from the `apps/indexer` directory OR use pnpm filter from the root.

### Option A: From apps/indexer directory (Recommended)

```bash
cd apps/indexer
```

### Option B: From repository root (using pnpm filter)

```bash
# From repo root, use filter to target the indexer package
pnpm --filter erc8004-indexer deploy
```

---

### Step 1: Ensure D1 Database is Set Up

Your D1 database should already be configured in `wrangler.toml`. Verify it exists:

```bash
# From apps/indexer directory:
cd apps/indexer
wrangler d1 list
```

If you don't see `erc8004-indexer`, create it:
```bash
pnpm d1:create
```
Then update `database_id` in `wrangler.toml` with the returned ID.

### Step 2: Run Database Migrations

Make sure your D1 database has the correct schema:

```bash
# From apps/indexer directory:
cd apps/indexer
pnpm d1:migrate
```

This applies `migrations/0001_initial.sql` to your remote D1 database.

### Step 3: Deploy the Worker

**From `apps/indexer` directory:**

Use `wrangler` directly (pnpm may have issues with "deploy" as a script name):

```bash
cd apps/indexer
wrangler deploy                    # Production
wrangler deploy --env development  # Development
```

**Or use pnpm run:**
```bash
cd apps/indexer
pnpm run deploy        # Production
pnpm run deploy:dev    # Development
```

### Step 4: Verify Deployment

After deployment, you'll get a URL like:
- Production: `https://erc8004-indexer-graphql.your-account.workers.dev`
- Development: `https://erc8004-indexer-graphql-dev.your-account.workers.dev`

Test the GraphQL endpoint:
```bash
curl https://your-worker-url.workers.dev/health
```

Test GraphiQL (visual GraphQL explorer):
```
https://your-worker-url.workers.dev/graphiql
```

## Testing the GraphQL API

### Example Query

Test with a simple query:

```bash
curl -X POST https://your-worker-url.workers.dev/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ agentsByChain(chainId: 11155111, limit: 5) { agentId agentName agentAddress } }"
  }'
```

### GraphiQL Interface

Visit `https://your-worker-url.workers.dev/graphiql` in your browser to use the interactive GraphQL playground.

Try this query:
```graphql
query {
  agentsByChain(chainId: 11155111, limit: 10) {
    agentId
    agentName
    agentAddress
    description
    a2aEndpoint
  }
}
```

## Common Commands

```bash
# Deploy to production
pnpm deploy

# Deploy to development
pnpm deploy:dev

# Run migrations on remote D1
pnpm d1:migrate

# Test locally before deploying
pnpm dev:worker

# View D1 databases
wrangler d1 list

# Query D1 from CLI
wrangler d1 execute erc8004-indexer --remote --command="SELECT COUNT(*) FROM agents"
```

## Troubleshooting

### "Database not found"
- Run `pnpm d1:create` if database doesn't exist
- Update `database_id` in `wrangler.toml`

### "No such table"
- Run `pnpm d1:migrate` to apply schema

### "Authentication failed"
- Run `wrangler login` to authenticate with Cloudflare

### Update Existing Deployment
Just run `pnpm deploy` again. Wrangler will update the existing worker.

## Custom Domain (Optional)

To use a custom domain, update the `route` in `wrangler.toml`:

```toml
[env.production]
route = { pattern = "graphql.yourdomain.com/*", zone_name = "yourdomain.com" }
```

You'll need to add the domain to Cloudflare first.

