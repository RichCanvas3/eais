# ERC-8004 Agentic Trust SDK

A TypeScript SDK for managing AI agents with ENS integration, identity management, and reputation systems on Ethereum L1 and L2. This SDK extends the core ERC-8004 SDK with agent-specific functionality.

## Features

- **AI Agent Management**: Complete lifecycle management for AI agents
- **ENS Integration**: Seamless integration with Ethereum Name Service for agent naming
- **Multi-Chain Support**: Works on Ethereum L1 and L2 networks (Base, Optimism)
- **Identity Management**: Agent identity registration and metadata management
- **Reputation System**: Feedback and scoring for AI agents
- **Organization Support**: Tools for managing agent organizations

## Installation

```bash
npm install @erc8004/agentic-trust-sdk
# or
yarn add @erc8004/agentic-trust-sdk
# or
pnpm add @erc8004/agentic-trust-sdk
```

## Quick Start

```typescript
import { AIAgentENSClient, AIAgentIdentityClient } from '@erc8004/agentic-trust-sdk';
import { sepolia } from 'viem/chains';

// Create an ENS client for agent management
const ensClient = new AIAgentENSClient(
  sepolia,
  'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
  adapter,
  '0x...', // ENS Registry
  '0x...', // ENS Resolver
  '0x...'  // Identity Registry
);

// Create an identity client
const identityClient = new AIAgentIdentityClient(
  11155111, // ETH Sepolia chain ID
  'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
  '0x...'  // Identity Registry
);

// Get agent identity by name
const { agentId, account } = await ensClient.getAgentIdentityByName('alice.agent.eth');
```

## Core Components

### AIAgentENSClient

Handles ENS operations for AI agents:

```typescript
import { AIAgentENSClient } from '@erc8004/agentic-trust-sdk';

const ensClient = new AIAgentENSClient(chain, rpcUrl, adapter, ensRegistry, ensResolver, identityRegistry);

// Get agent identity by ENS name
const { agentId, account } = await ensClient.getAgentIdentityByName('alice.agent.eth');

// Get agent account by ENS name
const account = await ensClient.getAgentAccountByName('alice.agent.eth');

// Get reverse resolution (account to ENS name)
const { agentId, ensName } = await ensClient.getAgentIdentityByAccount('0x...');
```

### AIAgentIdentityClient

Manages agent identity and metadata:

```typescript
import { AIAgentIdentityClient } from '@erc8004/agentic-trust-sdk';

const identityClient = new AIAgentIdentityClient(chainId, rpcUrl, identityRegistry);

// Get agent metadata
const metadata = await identityClient.getMetadata(agentId, 'agentName');

// Get agent name
const name = await identityClient.getAgentName(agentId);

// Get agent EOA by account
const eoa = await identityClient.getAgentEoaByAgentAccount(agentAccount);
```

### AIAgentReputationClient

Handles reputation and feedback:

```typescript
import { AIAgentReputationClient } from '@erc8004/agentic-trust-sdk';

const reputationClient = new AIAgentReputationClient(chain, orgAdapter, agentAdapter, reputationRegistry);

// Give feedback to an agent
await reputationClient.giveFeedback({
  agent: '0x...',
  score: 5,
  feedback: 'Excellent service!',
  metadata: [{ key: 'category', value: 'quality' }]
});

// Get reputation score
const score = await reputationClient.getReputationScore('0x...');
```

### AIAgentL2ENSDurenClient

L2-specific ENS operations:

```typescript
import { AIAgentL2ENSDurenClient } from '@erc8004/agentic-trust-sdk';

const l2Client = new AIAgentL2ENSDurenClient(chain, rpcUrl, adapter, ensRegistry, ensResolver, identityRegistry);

// L2-specific agent operations
const account = await l2Client.getAgentAccountByName('alice.agent.base');
```

### OrgIdentityClient

Organization management utilities:

```typescript
import { OrgIdentityClient } from '@erc8004/agentic-trust-sdk';

const orgClient = new OrgIdentityClient(adapter, { ensRegistry: '0x...', rpcUrl: 'https://...' });

// Get organization account by ENS name
const account = await orgClient.getOrgAccountByName('myorg.eth');

// Get organization EOA by account
const eoa = await orgClient.getOrgEoaByAccount(orgAccount);
```

## Supported Networks

- **Ethereum Sepolia** (Chain ID: 11155111)
- **Base Sepolia** (Chain ID: 84532)
- **Optimism Sepolia** (Chain ID: 11155420)

## Dependencies

This SDK depends on:
- `@erc8004/sdk` - Core ERC-8004 functionality
- `viem` - Ethereum library
- `ethers` - Alternative Ethereum library
- `@metamask/delegation-toolkit` - MetaMask integration
- `@thenamespace/mint-manager` - ENS minting
- `@thenamespace/indexer` - ENS indexing

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

## Architecture

The Agentic Trust SDK is built on top of the core ERC-8004 SDK and provides:

1. **Agent-Specific Extensions**: Specialized classes for AI agent management
2. **ENS Integration**: Seamless naming and resolution for agents
3. **Multi-Chain Support**: Works across different Ethereum networks
4. **Reputation Management**: Feedback and scoring systems
5. **Organization Tools**: Utilities for managing agent organizations

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
- Full AI agent management support
- ENS integration for L1 and L2
- Reputation and feedback systems
- Organization management tools
- Multi-chain support
