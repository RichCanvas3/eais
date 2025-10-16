# ERC-8004 Indexer

## Setup
- Copy env:
  cp .env.example .env
- Install deps from repo root:
  pnpm install

## Run
- pnpm dev:indexer

## Notes
- Writes SQLite DB at DB_PATH (default apps/indexer/data/registry.db).
- Reads chain via RPC_HTTP_URL; optional RPC_WS_URL.