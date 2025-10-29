# Quick Setup: Enable D1 in Your .env File

Your `.env` file currently has `DB_PATH` pointing to `registryV2.db`, but to use Cloudflare D1, you need to add `USE_D1=true`.

## Quick Fix

Add these lines to `apps/indexer/.env`:

```env
# Enable D1 (this makes the indexer use Cloudflare D1 and ignore DB_PATH)
USE_D1=true

# Your Cloudflare credentials
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_D1_DATABASE_ID=2b924f66-77c1-4faa-9b14-c0b1c6d208e9
CLOUDFLARE_API_TOKEN=your-api-token
```

**Note**: The `DB_PATH` variable will be completely ignored when `USE_D1=true`, so you don't need to change it.

## After Setup

The indexer will:
- ✅ Use Cloudflare D1 instead of `registryV2.db`
- ✅ Write directly to the same database as your GraphQL API
- ✅ Ignore the `DB_PATH` setting completely

## Verify It's Working

When you start the indexer, you should see:
```
📡 Using Cloudflare D1 database
```

If you see:
```
💾 Using local SQLite database: ...
```

Then `USE_D1` is not set to `true`. Check your `.env` file.

