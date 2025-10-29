import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { DB_PATH, USE_D1, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN } from "./env";
import { createD1Database } from "./db-d1";

// Database abstraction - supports both SQLite and Cloudflare D1
let db: any;
let isD1 = false;

if (USE_D1) {
  // Use Cloudflare D1
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DATABASE_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('D1 configuration incomplete. Please set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN');
  }
  console.log('📡 Using Cloudflare D1 database');
  isD1 = true;
  db = createD1Database({
    accountId: CLOUDFLARE_ACCOUNT_ID,
    databaseId: CLOUDFLARE_D1_DATABASE_ID,
    apiToken: CLOUDFLARE_API_TOKEN,
  });
} else {
  // Use local SQLite - wrap to make it async-compatible
  function resolveDatabaseFilePath(configuredPath: string): string {
    return path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
  }

  const databaseFilePath = resolveDatabaseFilePath(DB_PATH);
  const databaseDirectory = path.dirname(databaseFilePath);
  if (!fs.existsSync(databaseDirectory)) {
    fs.mkdirSync(databaseDirectory, { recursive: true });
  }

  console.log('💾 Using local SQLite database:', databaseFilePath);
  const sqliteDb = new Database(databaseFilePath);
  sqliteDb.pragma("journal_mode = WAL");
  
  // Wrap SQLite to make it async-compatible
  db = {
    prepare: (sql: string) => {
      const stmt = sqliteDb.prepare(sql);
      return {
        run: (...params: any[]) => Promise.resolve(stmt.run(...params)),
        get: (...params: any[]) => Promise.resolve(stmt.get(...params)),
        all: (...params: any[]) => Promise.resolve(stmt.all(...params)),
      };
    },
    exec: (sql: string) => Promise.resolve(sqliteDb.exec(sql)),
    pragma: (sql: string) => sqliteDb.pragma(sql),
  };
}

export { db };

// Helper function to get current timestamp (Unix epoch seconds)
// D1 doesn't support strftime, so we use JavaScript Date.now() when using D1
export function getCurrentTimestamp(): number {
  if (isD1) {
    return Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  }
  // For SQLite, we'll use strftime in SQL
  return 0; // Placeholder, actual value comes from SQL strftime
}

export function formatSQLTimestamp(): string {
  if (isD1) {
    return Math.floor(Date.now() / 1000).toString();
  }
  return "strftime('%s','now')";
}

// Initialize schema - for SQLite only (D1 schema should be managed via migrations)
async function initializeSchema() {
  if (USE_D1) {
    // D1 schema should already exist from migrations
    // Skip initialization - tables should be created via wrangler d1 execute
    console.log('📡 D1 database - assuming schema already exists from migrations');
    return;
  }

  // Local SQLite - create tables synchronously
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        chainId INTEGER NOT NULL,
        agentId TEXT NOT NULL,
        agentAddress TEXT NOT NULL,
        agentOwner TEXT NOT NULL,
        agentName TEXT NOT NULL,
        metadataURI TEXT,
        createdAtBlock INTEGER NOT NULL,
        createdAtTime  INTEGER NOT NULL,
        -- extended metadata fields (formerly in agent_metadata)
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
        id TEXT PRIMARY KEY,        -- txHash:logIndex
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

      CREATE TABLE IF NOT EXISTS agent_metadata (
        agentId TEXT PRIMARY KEY,
        type TEXT,
        agentName TEXT,
        description TEXT,
        image TEXT,
        a2aEndpoint TEXT,
        ensEndpoint TEXT,
        agentAccountEndpoint TEXT,
        supportedTrust TEXT,
        rawJson TEXT,
        updatedAtTime INTEGER NOT NULL
      );
    `);
  } catch (error) {
    console.warn('Schema initialization warning:', error);
  }
}

initializeSchema();

// Best-effort migrate: ensure extended columns exist on agents (SQLite only)
if (!isD1) {
  try { db.exec("ALTER TABLE agents ADD COLUMN chainId INTEGER DEFAULT 11155111"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN type TEXT"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN description TEXT"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN image TEXT"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN a2aEndpoint TEXT"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN ensEndpoint TEXT"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN agentAccountEndpoint TEXT"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN supportedTrust TEXT"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN rawJson TEXT"); } catch {}
  try { db.exec("ALTER TABLE agents ADD COLUMN updatedAtTime INTEGER"); } catch {}
}

// Migrate existing data to have composite primary key (chainId, agentId) - SQLite only
async function migrateCompositeKey() {
  if (isD1) return; // Skip for D1
  
  try {
    // Check if we need to migrate to composite primary key
    const tableInfo = (await db.prepare("PRAGMA table_info(agents)").all()) as any[];
    const chainIdColumn = tableInfo.find(col => col.name === 'chainId');
    const agentIdColumn = tableInfo.find(col => col.name === 'agentId');
    
    // Check if agentId is currently the primary key (single column)
    const isSinglePrimaryKey = agentIdColumn && agentIdColumn.pk === 1 && tableInfo.filter(col => col.pk === 1).length === 1;
    
    if (chainIdColumn && agentIdColumn && isSinglePrimaryKey) {
      console.log('Migrating to composite primary key (chainId, agentId)...');
      
      // Create new table with composite primary key
      await db.exec(`
        CREATE TABLE agents_new (
          chainId INTEGER NOT NULL DEFAULT 11155111,
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
        )
      `);
      
      // Copy data from old table to new table
      await db.exec(`
        INSERT INTO agents_new (
          chainId, agentId, agentAddress, agentOwner, agentName, metadataURI,
          createdAtBlock, createdAtTime, type, description, image,
          a2aEndpoint, ensEndpoint, agentAccountEndpoint, supportedTrust,
          rawJson, updatedAtTime
        )
        SELECT 
          COALESCE(chainId, 11155111), agentId, agentAddress, agentOwner, agentName, metadataURI,
          createdAtBlock, createdAtTime, type, description, image,
          a2aEndpoint, ensEndpoint, agentAccountEndpoint, supportedTrust,
          rawJson, updatedAtTime
        FROM agents
      `);
      
      // Drop old table and rename new table
      await db.exec("DROP TABLE agents");
      await db.exec("ALTER TABLE agents_new RENAME TO agents");
      
      console.log('Successfully migrated to composite primary key (chainId, agentId)');
    }
  } catch (error) {
    console.warn('Migration to composite primary key failed:', error);
  }
}

migrateCompositeKey();

export async function getCheckpoint(chainId?: number): Promise<bigint> {
  const key = chainId ? `lastProcessed_${chainId}` : 'lastProcessed';
  const row = await db.prepare("SELECT value FROM checkpoints WHERE key=?").get(key) as { value?: string } | undefined;
  return row?.value ? BigInt(row.value) : 0n;
}

export async function setCheckpoint(bn: bigint, chainId?: number): Promise<void> {
  const key = chainId ? `lastProcessed_${chainId}` : 'lastProcessed';
  await db.prepare("INSERT INTO checkpoints(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(bn));
}
