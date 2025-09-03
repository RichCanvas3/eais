# Ethereum Agent Identity Service (EAIS)



## Quick start

```bash
# 1) Set env
cp .env.example .env

# ensure correct pnpm version (optional but recommended)
corepack enable
corepack prepare pnpm@9.7.0 --activate

# remove potentially broken installs and caches
rm -rf node_modules apps/*/node_modules apps/*/.next
rm -f pnpm-lock.yaml

# fresh install at the workspace root
pnpm install




pnpm dev:indexer


pnpm dev:web
```

Open http://localhost:3000.

See **WSL setup** in this README for recommended steps on Windows Subsystem for Linux.
