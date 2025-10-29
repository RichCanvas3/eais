# Deploying Indexer GraphQL to Cloudflare Workers

This guide explains how to deploy the ERC8004 Indexer GraphQL API to Cloudflare Workers.

## Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Install Cloudflare's deployment tool
   ```bash
   npm install -g wrangler
   # or
   pnpm add -g wrangler
   ```
3. **Cloudflare Authentication**: Login to Cloudflare
   ```bash
   wrangler login
   ```

## Setup Steps

### Step 1: Create D1 Database

Cloudflare D1 is a SQLite-compatible database for Workers:

```bash
cd apps/indexer
wrangler d1 create erc8004-indexer
```

This will output:
```
✅ Successfully created DB 'erc8004-indexer'!

[[d1_databases]]
binding = "DB"
database_name = "erc8004-indexer"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Important**: Copy the `database_id` and update it in `wrangler.toml`.

### Step 2: Update wrangler.toml

Edit `wrangler.toml` and set the `database_id`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "erc8004-indexer"
database_id = "your-database-id-here"
```

### Step 3: Initialize Database Schema

Create the database schema in D1. First, create a migration file:

```bash
# Create migrations directory
mkdir -p migrations

# Create initial schema migration
cat > migrations/0001_initial.sql << 'EOF'
CREATE TABLE IF NOT EXISTS agents (
  chainId INTEGER NOT NULL,
  agentId TEXT NOT NULL,
  agentAddress TEXT NOT NULL,
  agentOwner TEXT NOT NULL,
  agentName TEXT NOT NULL,
  metadataURI TEXT,
  createdAtBlock INTEGER NOT NULL,
  createdAtTime INTEGER NOT NULL,
  type TEXT,
  description TEXT,
  image TEXT,
  a2aEndpoint TEXT,
  ensEndpoint TEXT,
  agentAccountEndpoint TEXT,
  supportedTrust TEXT,
  rawJson TEXT,
  updatedAtTime INTEGER,
  PRIMARY KEY (chainId, agentId)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  agentId TEXT NOT NULL,
  type TEXT NOT NULL,
  blockNumber INTEGER NOT NULL,
  logIndex INTEGER NOT NULL,
  txHash TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agents_chainId ON agents(chainId);
CREATE INDEX IF NOT EXISTS idx_agents_agentOwner ON agents(agentOwner);
CREATE INDEX IF NOT EXISTS idx_agents_createdAtTime ON agents(createdAtTime);
EOF
```

Apply the migration:

```bash
wrangler d1 execute erc8004-indexer --file=./migrations/0001_initial.sql
```

Or apply to a specific environment:

```bash
# Local/testing
wrangler d1 execute erc8004-indexer --local --file=./migrations/0001_initial.sql

# Production
wrangler d1 execute erc8004-indexer --remote --file=./migrations/0001_initial.sql
```

### Step 4: Migrate Data (Optional)

If you have existing data from your local SQLite database, you can export and import it:

```bash
# Export from local SQLite
sqlite3 agents.db .dump > dump.sql

# Clean up the dump file (remove SQLite-specific commands)
# Then execute relevant INSERT statements to D1
wrangler d1 execute erc8004-indexer --remote --file=dump.sql
```

**Note**: For large datasets, you may want to write a migration script to batch insert data.

### Step 5: Install Dependencies

```bash
cd apps/indexer
pnpm install
```

Add Cloudflare Workers types:

```bash
pnpm add -D @cloudflare/workers-types
```

### Step 6: Configure TypeScript

Update `tsconfig.json` to include Cloudflare Workers types:

```json
{
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"]
  }
}
```

### Step 7: Deploy

Deploy to Cloudflare Workers:

```bash
# Preview deployment
wrangler dev

# Deploy to production
wrangler deploy

# Deploy to specific environment
wrangler deploy --env production
```

## Local Development

Test locally with a local D1 database:

```bash
# Start local development server with local D1
wrangler dev --local

# Or use remote D1 in development (faster but uses remote resources)
wrangler dev
```

The server will be available at `http://localhost:8787`

- GraphQL endpoint: `http://localhost:8787/graphql`
- GraphiQL: `http://localhost:8787/graphiql`
- Health check: `http://localhost:8787/health`

## Environment Variables

Add environment variables via Wrangler:

```bash
# Set environment variable
wrangler secret put MY_SECRET_KEY

# List secrets
wrangler secret list
```

Or in `wrangler.toml`:

```toml
[vars]
MY_VARIABLE = "value"
```

## Database Management

### View Database Info

```bash
wrangler d1 info erc8004-indexer
```

### Execute SQL Commands

```bash
# Local
wrangler d1 execute erc8004-indexer --local --command="SELECT COUNT(*) FROM agents"

# Remote
wrangler d1 execute erc8004-indexer --remote --command="SELECT COUNT(*) FROM agents"
```

### Export Database

```bash
wrangler d1 export erc8004-indexer --output=backup.sql
```

## Updating the Worker

After making changes:

1. Test locally: `wrangler dev --local`
2. Deploy: `wrangler deploy`

## Monitoring

View logs and analytics:

```bash
# View logs
wrangler tail

# View real-time logs with filters
wrangler tail --format pretty
```

Access analytics in the Cloudflare Dashboard:
1. Go to Workers & Pages
2. Select your worker
3. View analytics, logs, and metrics

## Custom Domain (Optional)

To use a custom domain:

1. In Cloudflare Dashboard, add a custom route
2. Or update `wrangler.toml`:

```toml
routes = [
  { pattern = "graphql.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

## Troubleshooting

### Database Connection Issues

- Ensure `database_id` is correct in `wrangler.toml`
- Verify database exists: `wrangler d1 list`
- Check binding name matches (`DB` in code, binding in wrangler.toml)

### Type Errors

- Install `@cloudflare/workers-types`
- Update `tsconfig.json` to include the types

### Build Errors

- Ensure all dependencies are installed
- Check that Node.js modules are compatible with Workers (some aren't)
- Use `wrangler dev` to see detailed error messages

### Performance

- D1 has limits: 100,000 reads/day (free tier)
- For high traffic, consider caching responses
- Use Cloudflare Cache API for frequently accessed queries

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g wrangler
      - run: npm install
      - run: wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Cost Considerations

- **Free Tier**: 100,000 D1 reads/day, 100,000 requests/day
- **Paid Plans**: Pay-as-you-go pricing
- Check [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Next Steps

1. Set up automatic deployments on git push
2. Configure monitoring and alerts
3. Set up database backups
4. Implement rate limiting if needed
5. Add authentication/authorization if required

