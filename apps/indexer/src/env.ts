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

export const REGISTRY_ADDRESS = must("REGISTRY_ADDRESS") as `0x${string}`;
export const RPC_HTTP_URL      = must("RPC_HTTP_URL");
export const RPC_WS_URL        = process.env.RPC_WS_URL; // optional
export const CONFIRMATIONS     = Number(process.env.CONFIRMATIONS ?? 12);
export const DB_PATH           = process.env.DB_PATH ?? "./data/registry.db";
export const START_BLOCK       = BigInt(process.env.START_BLOCK ?? 0);
export const LOGS_CHUNK_SIZE   = BigInt(process.env.LOGS_CHUNK_SIZE ?? 10);
export const BACKFILL_MODE     = (process.env.BACKFILL_MODE ?? 'logs') as 'logs' | 'ids';
