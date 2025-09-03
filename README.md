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



## Credits
This implementation draws from the ChaosChain reference work:
[trustless-agents-erc-ri](https://github.com/ChaosChain/trustless-agents-erc-ri).

## Specification

Implements: [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004)  
_Status: Draft (Standards Track: ERC)_

[![Spec: ERC-8004](https://img.shields.io/badge/spec-ERC--8004-blue)](https://eips.ethereum.org/EIPS/eip-8004)


See **WSL setup** in this README for recommended steps on Windows Subsystem for Linux.


