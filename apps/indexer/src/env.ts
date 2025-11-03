// Only load dotenv in Node.js (local development), not in Workers
// Workers get env vars from wrangler.toml and Cloudflare dashboard
// Check if we're in Node.js environment (has process and import.meta.url)
const isNodeEnvironment = typeof process !== 'undefined' && 
                          typeof process.env === 'object' &&
                          typeof import.meta !== 'undefined' && 
                          import.meta.url &&
                          import.meta.url.startsWith('file:');

// Load dotenv synchronously using createRequire for ES module compatibility
// This code only runs in Node.js, not in Workers
if (isNodeEnvironment) {
  try {
    // Use createRequire to get require in ES module context
    // @ts-ignore - createRequire exists but TypeScript types may be outdated
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const dotenv = require("dotenv");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    
    // Load additional .env files to support monorepo root setups.
    // Precedence: package-local .env first, then repo-root .env fills in missing values.
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    // Load package-local env: apps/indexer/.env
    const localEnvPath = path.resolve(__dirname, "../.env");
    const result1 = dotenv.config({ path: localEnvPath, override: false });
    // Load repo-root env: ./.env
    const rootEnvPath = path.resolve(__dirname, "../../../.env");
    const result2 = dotenv.config({ path: rootEnvPath, override: false });
    
    // Debug: Log if env file was loaded
    if (process.env.DEBUG_ENV) {
      console.log('Local .env loaded:', !result1.error, localEnvPath);
      console.log('Root .env loaded:', !result2.error, rootEnvPath);
      console.log('ETH_SEPOLIA_RPC_HTTP_URL:', process.env.ETH_SEPOLIA_RPC_HTTP_URL || 'NOT FOUND');
    }
  } catch (error) {
    // dotenv not available (e.g., in Workers) - this is fine
    // Workers use env vars from wrangler.toml and Cloudflare dashboard
    if (process.env.DEBUG_ENV) {
      console.error('Error loading dotenv:', error);
    }
  }
}

function must(name: string) {
  // In Workers, process.env may not exist or be empty - return empty string instead of throwing
  // The actual values come from the env parameter passed to the Worker
  if (!isNodeEnvironment) {
    return '';
  }
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const ETH_SEPOLIA_IDENTITY_REGISTRY = isNodeEnvironment ? (process.env.ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`) : undefined;
export const ETH_SEPOLIA_RPC_HTTP_URL      = isNodeEnvironment ? must("ETH_SEPOLIA_RPC_HTTP_URL") : '';

export const BASE_SEPOLIA_IDENTITY_REGISTRY = isNodeEnvironment ? (process.env.BASE_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`) : undefined;
export const BASE_SEPOLIA_RPC_HTTP_URL      = isNodeEnvironment ? must("BASE_SEPOLIA_RPC_HTTP_URL") : '';

export const OP_SEPOLIA_IDENTITY_REGISTRY = isNodeEnvironment ? (process.env.OP_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`) : undefined;
export const OP_SEPOLIA_RPC_HTTP_URL      = isNodeEnvironment ? (process.env.OP_SEPOLIA_RPC_HTTP_URL || '') : '';

export const RPC_WS_URL        = process.env.RPC_WS_URL; // optional
export const CONFIRMATIONS     = Number(process.env.CONFIRMATIONS ?? 12);
export const START_BLOCK       = BigInt(process.env.START_BLOCK ?? 0);
export const LOGS_CHUNK_SIZE   = BigInt(process.env.LOGS_CHUNK_SIZE ?? 10);
export const BACKFILL_MODE     = (process.env.BACKFILL_MODE ?? 'logs') as 'logs' | 'ids';

export const ETH_SEPOLIA_GRAPHQL_URL       = process.env.ETH_SEPOLIA_GRAPHQL_URL || '';
export const BASE_SEPOLIA_GRAPHQL_URL       = process.env.BASE_SEPOLIA_GRAPHQL_URL || '';
export const OP_SEPOLIA_GRAPHQL_URL       = process.env.OP_SEPOLIA_GRAPHQL_URL || '';
export const GRAPHQL_API_KEY   = process.env.GRAPHQL_API_KEY || '';
export const GRAPHQL_POLL_MS   = Number(process.env.GRAPHQL_POLL_MS ?? 120000);
export const GRAPHQL_SERVER_PORT = Number(process.env.GRAPHQL_SERVER_PORT ?? 4000);

// Cloudflare D1 configuration (required for all environments)
// Only enforce in Node.js (local dev), not in Workers
export const CLOUDFLARE_ACCOUNT_ID = isNodeEnvironment ? must("CLOUDFLARE_ACCOUNT_ID") : '';
export const CLOUDFLARE_D1_DATABASE_ID = isNodeEnvironment ? must("CLOUDFLARE_D1_DATABASE_ID") : '';
export const CLOUDFLARE_API_TOKEN = isNodeEnvironment ? must("CLOUDFLARE_API_TOKEN") : '';
