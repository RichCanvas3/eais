# Quick Deploy: GraphQL API

## Step-by-Step Deployment

### 1. Navigate to indexer directory
```bash
cd apps/indexer
```

### 2. Ensure database is migrated (first time only)
```bash
pnpm run d1:migrate
```
This creates tables in your D1 database.

### 3. Deploy to Cloudflare Workers

**For Development (Recommended first):**
```bash
wrangler deploy --env development
```

**For Production:**
```bash
wrangler deploy --env=""
```

**Or using pnpm scripts:**
```bash
pnpm run deploy:dev    # Development
pnpm run deploy        # Production (may need --env="" handling)
```

### 4. Get Your URL

After successful deployment, you'll see output like:
```
✨  Upload complete...
🌍  https://erc8004-indexer-graphql-dev.YOUR-ACCOUNT.workers.dev
```

### 5. Test Your Deployment

**Health Check:**
```bash
curl https://YOUR-WORKER-URL.workers.dev/health
```

**GraphiQL (Visual Interface):**
Open in browser: `https://YOUR-WORKER-URL.workers.dev/graphiql`

**Test GraphQL Query:**
```bash
curl -X POST https://YOUR-WORKER-URL.workers.dev/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ agentsByChain(chainId: 11155111, limit: 5) { agentId agentName agentAddress } }"}'
```

## Troubleshooting

### Authentication Error (Current Issue)

**Error**: `Authentication error [code: 10000]`

Your API token needs **additional permissions** for deploying Workers:

#### Fix Option 1: Update Token Permissions (Recommended)

1. Go to: https://dash.cloudflare.com/5da2feaa56593839672948e16c6e809d/api-tokens
2. Find your token or create a new one with these permissions:
   - ✅ **Account** → **Cloudflare Workers** → **Edit**
   - ✅ **Account** → **Cloudflare D1** → **Edit** (you already have this)
   - ✅ **Account** → **Zone** → **Read** (may be needed for custom domains)
3. Copy the new token
4. Update your `.env` file:
   ```env
   CLOUDFLARE_API_TOKEN=your-new-token-here
   ```

#### Fix Option 2: Use Wrangler Login Instead

Remove the API token and use `wrangler login`:

```bash
# Remove CLOUDFLARE_API_TOKEN from .env (or unset it)
unset CLOUDFLARE_API_TOKEN

# Login interactively
wrangler login
```

This will open a browser to authenticate. After login, you can deploy without API token issues.

### Multiple Environments Warning
This is normal - just use `--env development` or `--env=""` explicitly.

### Database Not Found
Run `pnpm run d1:create` first, then update `database_id` in `wrangler.toml`

