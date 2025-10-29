# Configuring Indexer to Use Cloudflare D1

This guide explains how to configure the indexer to write directly to Cloudflare D1 instead of local SQLite.

## Step 1: Get Cloudflare Credentials

You'll need three pieces of information:

### 1. Account ID

**⚠️ Important**: The Account ID is a **32-character hexadecimal string** (like `0123456789abcdef0123456789abcdef`), NOT your email address!

**Where to find it:**

**Method 1: Right Sidebar (Easiest)**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Log in to your account
3. Look at the **right sidebar** of any page
4. You'll see "Account ID" displayed (usually below your account name)
5. It will look like: `0123456789abcdef0123456789abcdef` (32 hex characters)
6. Click on it to copy, or select and copy manually

**Method 2: URL Method**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** or **D1** section
3. Look at the URL - it will contain your Account ID
4. Example URL: `https://dash.cloudflare.com/0123456789abcdef0123456789abcdef/workers`
5. The long hex string in the URL is your Account ID

**Method 3: Any D1 Database Page**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Workers & Pages** → **D1**
3. Click on any database (or create one)
4. In the database details page, the Account ID is shown in the URL

**What it looks like:**
- ✅ Correct: `0123456789abcdef0123456789abcdef` (32 characters, hex)
- ❌ Wrong: `Richardpedersen3@gmail.com` (this is your email, not Account ID)

**Still can't find it?**
You can also find it via Wrangler:
```bash
wrangler whoami
# Or check any wrangler.toml file in other Cloudflare Workers projects
```

### 2. Database ID

**You already have this!** It's in your `wrangler.toml` file:
- Look for `database_id = "2b924f66-77c1-4faa-9b14-c0b1c6d208e9"` in `apps/indexer/wrangler.toml`

**Or find it via command:**
```bash
wrangler d1 list
```

### 3. API Token

**How to create it:**

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**
3. You have two options:

   **Option A: Use the "Edit Cloudflare D1" template (Recommended)**
   - Scroll down to "API token templates"
   - Click **"Edit Cloudflare D1"**
   - Configure:
     - **Account Resources**: Include → Your account (select the account)
     - **Zone Resources**: Not needed (can leave as default)
     - Click **"Continue to summary"**
     - Review and click **"Create Token"**
   - **Important**: Copy the token immediately - you won't be able to see it again!

   **Option B: Create custom token**
   - Click **"Create Custom Token"**
   - Set the following:
     - **Token name**: `ERC8004-Indexer-D1`
     - **Permissions**: 
       - Account → Cloudflare D1 → Edit
     - **Account Resources**: 
       - Include → Select your account
     - Click **"Continue to summary"**
     - Review and click **"Create Token"**
   - Copy the token immediately!

**⚠️ Security Note**: Keep your API token secure! It has full access to your D1 databases. Never commit it to git.

## Step 2: Set Environment Variables

Add to your `.env` file in `apps/indexer/`:

```env
# Enable D1 (this will make the indexer ignore DB_PATH and use Cloudflare D1 instead)
USE_D1=true

# Cloudflare credentials
CLOUDFLARE_ACCOUNT_ID=your-account-id-here
CLOUDFLARE_D1_DATABASE_ID=your-database-id-here
CLOUDFLARE_API_TOKEN=your-api-token-here

# Optional: DB_PATH is only used if USE_D1=false
# If you want to use local SQLite instead, set USE_D1=false and DB_PATH to your desired file
# DB_PATH=./data/registry.db
```

**Important**: When `USE_D1=true`, the `DB_PATH` environment variable is completely ignored. The indexer will use Cloudflare D1 regardless of what `DB_PATH` is set to.

**Or** export them before running:

```bash
export USE_D1=true
export CLOUDFLARE_ACCOUNT_ID=your-account-id
export CLOUDFLARE_D1_DATABASE_ID=2b924f66-77c1-4faa-9b14-c0b1c6d208e9
export CLOUDFLARE_API_TOKEN=your-api-token
```

## Step 3: Verify Database Schema

Ensure your D1 database has the correct schema. If you haven't already:

```bash
cd apps/indexer
wrangler d1 execute erc8004-indexer --remote --file=./migrations/0001_initial.sql
```

## Step 4: Run the Indexer

```bash
pnpm dev
```

The indexer will now write directly to Cloudflare D1!

## Switching Back to Local SQLite

To use local SQLite again, either:
- Remove `USE_D1` from `.env`, or
- Set `USE_D1=false`

## Troubleshooting

### "D1 configuration incomplete"
- Check that all three environment variables are set
- Verify the values are correct (no extra spaces)

### "D1 API error: 401"
- Your API token is invalid or expired
- Regenerate the token in Cloudflare Dashboard

### "D1 API error: 403"
- Your API token doesn't have D1 permissions
- Check token permissions in Cloudflare Dashboard

### "D1 error: no such table"
- Run the migration: `wrangler d1 execute erc8004-indexer --remote --file=./migrations/0001_initial.sql`

### Performance Considerations

- D1 has rate limits: 100,000 reads/day (free tier)
- Writes are slower than local SQLite (network latency)
- Consider batching writes for better performance

## Benefits of Using D1

✅ **Same database as GraphQL API** - No need to sync
✅ **Automatic backups** - Managed by Cloudflare
✅ **Global availability** - Accessible from anywhere
✅ **No local database files** - Cleaner setup

