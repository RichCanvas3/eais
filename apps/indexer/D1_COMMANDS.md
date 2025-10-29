# Cloudflare D1 Database Commands

## Truncate/Clear Tables

D1 is based on SQLite, which doesn't support `TRUNCATE`. Use `DELETE FROM` instead.

### Clear All Data from Tables

**From command line:**

```bash
cd apps/indexer

# Clear agents table
wrangler d1 execute erc8004-indexer --remote --command="DELETE FROM agents;"

# Clear events table
wrangler d1 execute erc8004-indexer --remote --command="DELETE FROM events;"

# Clear checkpoints table
wrangler d1 execute erc8004-indexer --remote --command="DELETE FROM checkpoints;"

# Clear all tables at once
wrangler d1 execute erc8004-indexer --remote --command="DELETE FROM agents; DELETE FROM events; DELETE FROM checkpoints;"
```

### Using a SQL File

Create a file `clear_all.sql`:

```sql
-- Clear all data but keep table structure
DELETE FROM agents;
DELETE FROM events;
DELETE FROM checkpoints;
```

Then execute:
```bash
wrangler d1 execute erc8004-indexer --remote --file=./clear_all.sql
```

### Drop and Recreate Tables (Nuclear Option)

If you want to completely reset:

```bash
# Drop all tables
wrangler d1 execute erc8004-indexer --remote --command="DROP TABLE IF EXISTS agents; DROP TABLE IF EXISTS events; DROP TABLE IF EXISTS checkpoints; DROP TABLE IF EXISTS agent_metadata;"

# Recreate schema
wrangler d1 execute erc8004-indexer --remote --file=./migrations/0001_initial.sql
```

## Useful D1 Commands

### Check Table Row Counts

```bash
wrangler d1 execute erc8004-indexer --remote --command="SELECT COUNT(*) as agent_count FROM agents;"
wrangler d1 execute erc8004-indexer --remote --command="SELECT COUNT(*) as event_count FROM events;"
```

### View Table Structure

```bash
wrangler d1 execute erc8004-indexer --remote --command="PRAGMA table_info(agents);"
```

### Query Specific Data

```bash
# Get agents for a specific chain
wrangler d1 execute erc8004-indexer --remote --command="SELECT * FROM agents WHERE chainId = 11155111 LIMIT 5;"

# Count agents by chain
wrangler d1 execute erc8004-indexer --remote --command="SELECT chainId, COUNT(*) as count FROM agents GROUP BY chainId;"
```

## Local vs Remote

- **--remote**: Executes on Cloudflare D1 (production database)
- **--local**: Executes on local D1 database (for testing)

```bash
# Local testing
wrangler d1 execute erc8004-indexer --local --command="SELECT COUNT(*) FROM agents;"

# Remote (production)
wrangler d1 execute erc8004-indexer --remote --command="SELECT COUNT(*) FROM agents;"
```

## Quick Reset Script

Create `clear_d1.sh`:

```bash
#!/bin/bash
cd apps/indexer
echo "Clearing all D1 tables..."
wrangler d1 execute erc8004-indexer --remote --command="DELETE FROM agents; DELETE FROM events; DELETE FROM checkpoints;"
echo "✅ Tables cleared!"
```

Make it executable:
```bash
chmod +x clear_d1.sh
./clear_d1.sh
```

