import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";
import { DB_PATH } from "./env";

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

export const db = new Database(databaseFilePath);
db.pragma("journal_mode = WAL");

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

// Best-effort migrate: ensure extended columns exist on agents
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

// Migrate existing data to have composite primary key (chainId, agentId)
try {
  // Check if we need to migrate to composite primary key
  const tableInfo = db.prepare("PRAGMA table_info(agents)").all() as any[];
  const chainIdColumn = tableInfo.find(col => col.name === 'chainId');
  const agentIdColumn = tableInfo.find(col => col.name === 'agentId');
  
  // Check if agentId is currently the primary key (single column)
  const isSinglePrimaryKey = agentIdColumn && agentIdColumn.pk === 1 && tableInfo.filter(col => col.pk === 1).length === 1;
  
  if (chainIdColumn && agentIdColumn && isSinglePrimaryKey) {
    console.log('Migrating to composite primary key (chainId, agentId)...');
    
    // Create new table with composite primary key
    db.exec(`
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
    db.exec(`
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
    db.exec("DROP TABLE agents");
    db.exec("ALTER TABLE agents_new RENAME TO agents");
    
    console.log('Successfully migrated to composite primary key (chainId, agentId)');
  }
} catch (error) {
  console.warn('Migration to composite primary key failed:', error);
}

export function getCheckpoint(chainId?: number): bigint {
  const key = chainId ? `lastProcessed_${chainId}` : 'lastProcessed';
  const row = db.prepare("SELECT value FROM checkpoints WHERE key=?").get(key) as { value?: string } | undefined;
  return row?.value ? BigInt(row.value) : 0n;
}

export function setCheckpoint(bn: bigint, chainId?: number) {
  const key = chainId ? `lastProcessed_${chainId}` : 'lastProcessed';
  db.prepare("INSERT INTO checkpoints(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(bn));
}
