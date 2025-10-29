# Quick Start: Deploy to Cloudflare

## Prerequisites

1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   # or
   pnpm add -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

## Deployment Steps

### 1. Create D1 Database

```bash
cd apps/indexer
pnpm d1:create
```

Copy the `database_id` from the output.

### 2. Update wrangler.toml

Edit `wrangler.toml` and paste your `database_id`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "erc8004-indexer"
database_id = "your-database-id-here"  # Paste here
```

### 3. Initialize Database Schema

```bash
pnpm d1:migrate
```

### 4. Install Dependencies

```bash
pnpm install
```

### 5. Test Locally

```bash
pnpm dev:worker:local
```

Visit `http://localhost:8787/graphiql` to test.

### 6. Deploy to Cloudflare

```bash
pnpm deploy
```

## Available Scripts

- `pnpm dev:worker` - Run worker with remote D1 database
- `pnpm dev:worker:local` - Run worker with local D1 database
- `pnpm deploy` - Deploy to Cloudflare Workers (production)
- `pnpm deploy:dev` - Deploy to development environment
- `pnpm d1:create` - Create new D1 database
- `pnpm d1:migrate` - Run database migrations

## Migration from Local Database

If you have existing data in your local SQLite database:

```bash
# Export data
sqlite3 agents.db ".mode insert agents" ".output agents_inserts.sql" "SELECT * FROM agents;"

# Clean up and adapt the SQL for D1
# Then execute:
wrangler d1 execute erc8004-indexer --remote --file=agents_inserts.sql
```

## Access Your Deployed API

After deployment, your API will be available at:
- `https://erc8004-indexer-graphql.YOUR_SUBDOMAIN.workers.dev/graphql`
- `https://erc8004-indexer-graphql.YOUR_SUBDOMAIN.workers.dev/graphiql`

For full documentation, see [CLOUDFLARE_DEPLOY.md](./CLOUDFLARE_DEPLOY.md).

