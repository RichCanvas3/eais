import { CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN } from "./env";
import { createD1Database } from "./db-d1";

// Check if we're in Node.js environment (for local development)
const isNodeEnvironment = typeof process !== 'undefined' && 
                          typeof process.env === 'object' &&
                          typeof import.meta !== 'undefined' && 
                          import.meta.url &&
                          import.meta.url.startsWith('file:');

// In Workers, D1 is provided via env.DB binding, not via these env vars
// Only create D1 connection in Node.js (local development)
let db: any;

if (isNodeEnvironment) {
  // Always use Cloudflare D1 database (for local development)
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_D1_DATABASE_ID || !CLOUDFLARE_API_TOKEN) {
    throw new Error('D1 configuration incomplete. Please set CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN');
  }

  console.log('📡 Using Cloudflare D1 database (local Node.js)');
  db = createD1Database({
    accountId: CLOUDFLARE_ACCOUNT_ID,
    databaseId: CLOUDFLARE_D1_DATABASE_ID,
    apiToken: CLOUDFLARE_API_TOKEN,
  });
} else {
  // In Workers, db will be provided via env.DB - this is just a placeholder
  // The actual db instance should be passed from the Worker's env parameter
  console.log('📡 D1 database will be provided via env.DB (Workers environment)');
  // Create a dummy db object to prevent import errors, but it shouldn't be used
  db = null;
}

export { db };

// Helper function to get current timestamp (Unix epoch seconds)
// D1 doesn't support strftime, so we use JavaScript Date.now()
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000); // Unix timestamp in seconds
}

export function formatSQLTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

// Initialize schema - D1 schema should be managed via migrations
// This is just a safety check for development
async function initializeSchema() {
  // D1 schema should already exist from migrations
  // Skip initialization - tables should be created via wrangler d1 execute
  console.log('📡 D1 database - assuming schema already exists from migrations');
  
  // In Workers, db will be null - skip initialization
  if (!db) {
    console.log('📡 Skipping schema initialization in Workers (db provided via env.DB)');
    return;
  }
  
  // Safety check: Try to create access_codes table if it doesn't exist (for development)
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS access_codes (
        address TEXT PRIMARY KEY,
        accessCode TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        lastUsedAt INTEGER
      );
    `);
    console.log('✅ access_codes table verified/created in D1');
  } catch (error: any) {
    // If table already exists, that's fine. Otherwise log warning.
    if (!error?.message?.includes('already exists') && !error?.message?.includes('duplicate')) {
      console.warn('⚠️  Could not create access_codes table in D1. Run migration manually:');
      console.warn('   wrangler d1 execute erc8004-indexer --file=./migrations/0002_add_access_codes.sql');
      console.warn('   Error:', error?.message || error);
    } else {
      console.log('✅ access_codes table already exists in D1');
    }
  }
}

initializeSchema();

export async function getCheckpoint(chainId?: number): Promise<bigint> {
  const key = chainId ? `lastProcessed_${chainId}` : 'lastProcessed';
  const row = await db.prepare("SELECT value FROM checkpoints WHERE key=?").get(key) as { value?: string } | undefined;
  return row?.value ? BigInt(row.value) : 0n;
}

export async function setCheckpoint(bn: bigint, chainId?: number): Promise<void> {
  const key = chainId ? `lastProcessed_${chainId}` : 'lastProcessed';
  await db.prepare("INSERT INTO checkpoints(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, String(bn));
}
