# ERC8004 Validator Application

A validation service that uses the ERC8004 ValidationClient to validate agent identities, reputations, and other on-chain data.

## Features

- **Agent Identity Validation**: Validates agent identities using the ValidationClient
- **Reputation Validation**: Validates agent reputation scores and feedback
- **Multi-Chain Support**: Works across Ethereum L1 and L2 networks
- **Agentic Trust Integration**: Uses the agentic-trust-sdk for enhanced functionality
- **Database Storage**: Stores validation results in SQLite database

## Usage

```bash
# Development mode
pnpm dev:validator

# Build
pnpm build:validator

# Production
pnpm start:validator
```

## Environment Variables

Create a `.env` file with the following variables:

```env
# RPC URLs
ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
OP_SEPOLIA_RPC_URL=https://op-sepolia.g.alchemy.com/v2/YOUR_KEY

# Contract Addresses
ETH_SEPOLIA_IDENTITY_REGISTRY=0x...
BASE_SEPOLIA_IDENTITY_REGISTRY=0x...
OP_SEPOLIA_IDENTITY_REGISTRY=0x...

ETH_SEPOLIA_REPUTATION_REGISTRY=0x...
BASE_SEPOLIA_REPUTATION_REGISTRY=0x...
OP_SEPOLIA_REPUTATION_REGISTRY=0x...

# Validation Settings
VALIDATION_INTERVAL_MS=30000
VALIDATION_BATCH_SIZE=100
```

## Architecture

The validator application:

1. **Connects to multiple chains** (Ethereum Sepolia, Base Sepolia, Optimism Sepolia)
2. **Uses ValidationClient** from `@erc8004/sdk` for core validation logic
3. **Integrates with Agentic Trust SDK** for agent-specific validations
4. **Stores results** in a local SQLite database
5. **Runs continuously** with configurable intervals

## Validation Types

- **Identity Validation**: Verifies agent identity registrations and metadata
- **Reputation Validation**: Validates reputation scores and feedback authenticity
- **ENS Validation**: Validates ENS name resolutions and reverse lookups
- **Cross-Chain Validation**: Validates data consistency across chains
