import "dotenv/config";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load additional .env files to support monorepo root setups.
// Precedence: package-local .env first, then repo-root .env fills in missing values.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load package-local env: apps/indexer/.env
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: false });
// Load repo-root env: ./.env
dotenv.config({ path: path.resolve(__dirname, "../../../.env"), override: false });

function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const ETH_SEPOLIA_IDENTITY_REGISTRY = process.env.ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
export const ETH_SEPOLIA_RPC_HTTP_URL      = must("ETH_SEPOLIA_RPC_HTTP_URL");

export const BASE_SEPOLIA_IDENTITY_REGISTRY = process.env.BASE_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
export const BASE_SEPOLIA_RPC_HTTP_URL      = must("BASE_SEPOLIA_RPC_HTTP_URL");

export const OP_SEPOLIA_IDENTITY_REGISTRY = process.env.OP_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
export const OP_SEPOLIA_RPC_HTTP_URL      = process.env.OP_SEPOLIA_RPC_HTTP_URL || '';

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
export const CLOUDFLARE_ACCOUNT_ID = must("CLOUDFLARE_ACCOUNT_ID");
export const CLOUDFLARE_D1_DATABASE_ID = must("CLOUDFLARE_D1_DATABASE_ID");
export const CLOUDFLARE_API_TOKEN = must("CLOUDFLARE_API_TOKEN");
