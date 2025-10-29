import "dotenv/config";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load additional .env files to support monorepo root setups.
// Precedence: package-local .env first, then repo-root .env fills in missing values.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: false });


function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const ETH_SEPOLIA_IDENTITY_REGISTRY = process.env.ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
export const ETH_SEPOLIA_RPC_URL      = process.env.ETH_SEPOLIA_RPC_HTTP_URL as string;
export const ETH_SEPOLIA_GRAPHQL_URL       = process.env.ETH_SEPOLIA_GRAPHQL_URL || '';

export const BASE_SEPOLIA_IDENTITY_REGISTRY = process.env.BASE_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
export const BASE_SEPOLIA_RPC_URL      = process.env.BASE_SEPOLIA_RPC_HTTP_URL as string;
export const BASE_SEPOLIA_GRAPHQL_URL       = process.env.BASE_SEPOLIA_GRAPHQL_URL || '';

export const OP_SEPOLIA_IDENTITY_REGISTRY = process.env.OP_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
export const OP_SEPOLIA_RPC_URL      = process.env.OP_SEPOLIA_RPC_HTTP_URL || '';
export const OP_SEPOLIA_GRAPHQL_URL       = process.env.OP_SEPOLIA_GRAPHQL_URL || '';

export const ETH_SEPOLIA_REPUTATION_REGISTRY = process.env.ETH_SEPOLIA_REPUTATION_REGISTRY as `0x${string}`;
export const BASE_SEPOLIA_REPUTATION_REGISTRY = process.env.BASE_SEPOLIA_REPUTATION_REGISTRY as `0x${string}`;
export const OP_SEPOLIA_REPUTATION_REGISTRY = process.env.OP_SEPOLIA_REPUTATION_REGISTRY as `0x${string}`;

export const ETH_SEPOLIA_VALIDATION_REGISTRY = process.env.ETH_SEPOLIA_VALIDATION_REGISTRY as `0x${string}`;
export const BASE_SEPOLIA_VALIDATION_REGISTRY = process.env.BASE_SEPOLIA_VALIDATION_REGISTRY as `0x${string}`;
export const OP_SEPOLIA_VALIDATION_REGISTRY = process.env.OP_SEPOLIA_VALIDATION_REGISTRY as `0x${string}`;

export const VALIDATION_INTERVAL_MS = Number(process.env.VALIDATION_INTERVAL_MS ?? 30000);
export const VALIDATION_BATCH_SIZE = Number(process.env.VALIDATION_BATCH_SIZE ?? 100);
export const GRAPHQL_API_KEY   = process.env.GRAPHQL_API_KEY || '';
export const GRAPHQL_POLL_MS   = Number(process.env.GRAPHQL_POLL_MS ?? 120000);
export const DB_PATH           = process.env.DB_PATH ?? "./validator.db";
