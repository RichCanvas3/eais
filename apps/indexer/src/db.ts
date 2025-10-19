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
  agentId TEXT PRIMARY KEY,
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
  updatedAtTime INTEGER
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
try { db.exec("ALTER TABLE agents ADD COLUMN type TEXT"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN description TEXT"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN image TEXT"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN a2aEndpoint TEXT"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN ensEndpoint TEXT"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN agentAccountEndpoint TEXT"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN supportedTrust TEXT"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN rawJson TEXT"); } catch {}
try { db.exec("ALTER TABLE agents ADD COLUMN updatedAtTime INTEGER"); } catch {}

export function getCheckpoint(): bigint {
  const row = db.prepare("SELECT value FROM checkpoints WHERE key='lastProcessed'").get() as { value?: string } | undefined;
  return row?.value ? BigInt(row.value) : 0n;
}

export function setCheckpoint(bn: bigint) {
  db.prepare("INSERT INTO checkpoints(key, value) VALUES('lastProcessed', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(bn));
}
