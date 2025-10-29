# ERC-8004 Trustless Agents SDK

A TypeScript SDK for interacting with ERC-8004 compliant implementations. This SDK makes zero assumptions beyond what the ERC-8004 specification says, treating all "MAY" fields as optional rather than mandatory.

## Features

- **ERC-8004 Compliant**: Implements the full ERC-8004 specification for trustless agents
- **Multi-Adapter Support**: Works with different blockchain libraries (Ethers.js, Viem)
- **TypeScript First**: Full TypeScript support with comprehensive type definitions
- **Modular Design**: Use only the components you need
- **Zero Assumptions**: Follows the spec exactly, no opinionated defaults

## Installation

```bash
npm install @erc8004/sdk
# or
yarn add @erc8004/sdk
# or
pnpm add @erc8004/sdk
```

## Quick Start

```typescript
import { ERC8004Client, EthersAdapter } from '@erc8004/sdk';
import { ethers } from 'ethers';

// Create an adapter for your preferred blockchain library
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY');
const adapter = new EthersAdapter(provider);

// Initialize the SDK
const client = new ERC8004Client({
  adapter,
  addresses: {
    identityRegistry: '0x...',
    reputationRegistry: '0x...',
    // ... other contract addresses
  }
});

// Use the client
const identity = await client.identity.getTokenURI(tokenId);
const reputation = await client.reputation.getReputationScore(agentAddress);
```

## Core Components

### ERC8004Client

The main client that provides access to all ERC-8004 functionality:

```typescript
import { ERC8004Client } from '@erc8004/sdk';

const client = new ERC8004Client({
  adapter: yourAdapter,
  addresses: {
    identityRegistry: '0x...',
    reputationRegistry: '0x...',
  }
});

// Access different modules
const identity = client.identity;
const reputation = client.reputation;
const validation = client.validation;
```

### IdentityClient

Handles identity-related operations:

```typescript
import { IdentityClient } from '@erc8004/sdk';

const identityClient = new IdentityClient(adapter, identityRegistryAddress);

// Get token URI for an identity
const tokenURI = await identityClient.getTokenURI(tokenId);

// Get owner of an identity
const owner = await identityClient.getOwner(tokenId);

// Check if an identity exists
const exists = await identityClient.exists(tokenId);
```

### ReputationClient

Manages reputation scoring and feedback:

```typescript
import { ReputationClient } from '@erc8004/sdk';

const reputationClient = new ReputationClient(adapter, reputationRegistryAddress);

// Get reputation score
const score = await reputationClient.getReputationScore(agentAddress);

// Give feedback
await reputationClient.giveFeedback({
  agent: agentAddress,
  score: 5,
  feedback: "Excellent service!",
  metadata: { category: "quality" }
});

// Get feedback history
const feedback = await reputationClient.getFeedbackHistory(agentAddress);
```

### ValidationClient

Provides validation utilities:

```typescript
import { ValidationClient } from '@erc8004/sdk';

const validationClient = new ValidationClient(adapter);

// Validate agent metadata
const isValid = await validationClient.validateAgentMetadata(metadata);

// Validate reputation score
const isValidScore = validationClient.validateReputationScore(score);
```

## Adapters

The SDK uses an adapter pattern to support different blockchain libraries:

### EthersAdapter

```typescript
import { EthersAdapter } from '@erc8004/sdk';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY');
const adapter = new EthersAdapter(provider);
```

### Custom Adapter

You can create your own adapter by implementing the `BlockchainAdapter` interface:

```typescript
import { BlockchainAdapter } from '@erc8004/sdk';

class MyCustomAdapter implements BlockchainAdapter {
  async call(contractAddress: string, abi: any, functionName: string, args: any[]): Promise<any> {
    // Your implementation
  }
  
  async send(contractAddress: string, abi: any, functionName: string, args: any[], options?: any): Promise<string> {
    // Your implementation
  }
  
  // ... implement other required methods
}
```

## Types

The SDK exports comprehensive TypeScript types:

```typescript
import type {
  AgentMetadata,
  ReputationScore,
  FeedbackData,
  IdentityData,
  BlockchainAdapter,
  ContractAddresses
} from '@erc8004/sdk';
```

## Contract Addresses

You'll need to provide contract addresses for your target network:

```typescript
const addresses: ContractAddresses = {
  identityRegistry: '0x...',    // ERC-8004 Identity Registry
  reputationRegistry: '0x...',  // ERC-8004 Reputation Registry
  // Add other contract addresses as needed
};
```

## Supported Networks

- Ethereum Mainnet
- Ethereum Sepolia (testnet)
- Base Sepolia (testnet)
- Optimism Sepolia (testnet)
- Any EVM-compatible network with ERC-8004 contracts deployed

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Cleaning

```bash
npm run clean
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](https://docs.erc8004.org)
- 💬 [Discord](https://discord.gg/erc8004)
- 🐛 [Issues](https://github.com/erc8004/erc-8004-identity-indexer/issues)

## Changelog

### v1.0.0
- Initial release
- Full ERC-8004 specification support
- Ethers.js adapter
- TypeScript definitions
- Comprehensive documentation
