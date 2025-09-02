# ERC‑8004 Identity Registry — Indexer + Web (React/TS)

This monorepo gives you a tiny TypeScript indexer (SQLite) and a Next.js UI for your existing IdentityRegistry.

## Quick start

```bash
# 1) Set env
cp .env.example .env

# 2) Install deps
pnpm i

# 3) Run the indexer
pnpm dev:indexer

# 4) Start the web app (new terminal)
pnpm dev:web
```

Open http://localhost:3000.

See **WSL setup** in this README for recommended steps on Windows Subsystem for Linux.
