# Identity Service (Express)

## Setup
- Copy env:
  cp .env.example .env
- Install deps from repo root:
  pnpm install

## Run
- pnpm --filter identity-service dev
- Defaults to http://localhost:4000

## Features
- Web3.Storage upload/download helpers
- OAuth callback stubs (LinkedIn/X/Shopify)
- Indexer DB read endpoints under /api/agents/*