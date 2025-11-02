# Syncing Missing Agents to Cloudflare D1

If the live site shows an older agentId (e.g., 768) but localhost shows a newer one (e.g., 781), the Cloudflare D1 database needs to be synced.

## Quick Fix: Sync Missing Agents

### Step 1: Get Cloudflare Credentials

You need your Cloudflare Account ID, D1 Database ID, and API Token:

1. **Account ID**: Found in `wrangler.toml` or at https://dash.cloudflare.com/ (right sidebar)
2. **Database ID**: Found in `wrangler.toml` (currently: `2b924f66-77c1-4faa-9b14-c0b1c6d208e9`)
3. **API Token**: Create at https://dash.cloudflare.com/profile/api-tokens with `Account.Cloudflare D1.Edit` permission

### Step 2: Set Environment Variables

In `apps/indexer/.env` or your shell:

```bash
export USE_D1=true
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_D1_DATABASE_ID="2b924f66-77c1-4faa-9b14-c0b1c6d208e9"
export CLOUDFLARE_API_TOKEN="your-api-token"

# Also set RPC URLs and other required vars
export ETH_SEPOLIA_RPC_HTTP_URL="your-rpc-url"
export BASE_SEPOLIA_RPC_HTTP_URL="your-rpc-url"
# ... etc
```

### Step 3: Run the Indexer

**Option A: Process specific missing agents (769-781)**

```bash
cd apps/indexer
for i in {769..781}; do
  pnpm dev:agent -- --agentId $i
done
```

**Option B: Run full backfill to catch up**

```bash
cd apps/indexer
pnpm dev
```

The backfill will query the subgraph and sync any missing agents to D1.

### Step 4: Verify

Check the live site - it should now show agent 781.

## Long-term Solution

To prevent this issue:
1. Set up a scheduled job (cron) to run the indexer periodically
2. Or implement `indexAgent` mutation in the Cloudflare Worker (requires RPC URLs in Worker environment)

## Troubleshooting

- If `D1 API error: 401`, check your API token permissions
- If `D1 configuration incomplete`, ensure all three Cloudflare env vars are set
- If agents still don't show, check the D1 database directly:
  ```bash
  cd apps/indexer
  npx wrangler d1 execute erc8004-indexer --remote --command="SELECT MAX(CAST(agentId AS INTEGER)) as max_id FROM agents;"
  ```
