import Database from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";

function resolveDbPath(): string {
  const configured = process.env.DB_PATH;
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(process.cwd(), configured);
  }
  // Try common locations depending on cwd (apps/web or repo root)
  const candidates = [
    path.resolve(process.cwd(), "../indexer/data/registryV2.db"),      // when cwd is apps/web
    path.resolve(process.cwd(), "apps/indexer/data/registryV2.db"),   // when cwd is repo root
  ];
  for (const candidate of candidates) {
    const dir = path.dirname(candidate);
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    }
    // Prefer the first candidate; no file existence check (read-only open will fail if truly missing)
    return candidate;
  }
  // Fallback (should not reach)
  return path.resolve(process.cwd(), "apps/indexer/data/registryV2.db");
}

const DB_PATH = resolveDbPath();
export const db = new Database(DB_PATH, { readonly: true });
