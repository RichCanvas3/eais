# Syncing Cloudflare Dashboard Changes to Local

When you make changes in the Cloudflare Dashboard (like environment variables, secrets, or other configuration), you need to manually sync them to your local `wrangler.toml` and `.env` files to prevent your local code from overriding them.

## Steps to Sync from Dashboard

### 1. List Current Secrets

Check what secrets are configured on Cloudflare:

```bash
cd apps/indexer

# For production (default)
npx wrangler secret list

# For development environment
npx wrangler secret list --env development
```

This shows which secrets exist (but not their values, as they're encrypted).

### 2. Document Environment Variables

In the Cloudflare Dashboard:
1. Go to Workers & Pages → Your Worker → Settings → Variables
2. Note all the **Environment Variables** (not secrets) listed
3. Update your `wrangler.toml` file to include them under `[vars]` or `[env.development.vars]`

### 3. Update `wrangler.toml`

Add any environment variables from the dashboard to your `wrangler.toml`:

```toml
# Production (default)
[vars]
  NODE_ENV = "production"
  # Add other vars from dashboard here

# Development
[env.development.vars]
  NODE_ENV = "development"
  # Add development-specific vars here
```

### 4. Document Secrets Locally

Since secrets can't be pulled (they're encrypted), create a `.env.secrets.example` file or document them in this file:

```bash
# Secrets configured in Cloudflare Dashboard:
# - GRAPHQL_SECRET_ACCESS_CODE (production)
# - GRAPHQL_SECRET_ACCESS_CODE (development)
```

**Important:** Never commit actual secret values to git. Only document that they exist.

### 5. Verify Configuration

After syncing, verify your local config matches the dashboard:

```bash
# View worker configuration
npx wrangler deployments list

# Test local development (will use local .env file)
pnpm dev:worker
```

## Best Practice Workflow

To avoid conflicts, follow this workflow:

1. **Always manage secrets locally first:**
   ```bash
   # Set secret locally (it will be synced to Cloudflare)
   npx wrangler secret put GRAPHQL_SECRET_ACCESS_CODE
   ```

2. **If you must make changes in the dashboard:**
   - Immediately document them locally
   - Update `wrangler.toml` if needed
   - Commit the updated config to git

3. **Before deploying:**
   - Check that your local `wrangler.toml` is up to date
   - Verify secrets exist: `npx wrangler secret list`
   - If deploying to a new environment, set secrets first

## Checking Current Remote Configuration

You can view your worker's current settings via the Cloudflare API or dashboard:

1. **Dashboard:** Workers & Pages → Your Worker → Settings
2. **Via CLI:** `npx wrangler deployments list` shows recent deployments
3. **Via API:** Use Cloudflare API to query worker configuration

## Important Notes

- **Secrets cannot be retrieved** once set (they're encrypted). You must reset them if you forget them.
- **Environment Variables** in `[vars]` can be synced by copying from dashboard to `wrangler.toml`
- **D1 Database bindings** are already in `wrangler.toml` - they won't change unless you recreate the database
- **Routes/Custom Domains** set in dashboard should also be added to `wrangler.toml` if you want them in version control

