'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { AIAgentIdentityClient } from '../../erc8004-agentic-trust-sdk';
import { useWeb3Auth } from './Web3AuthProvider';
import { extractPrivateKeyFromWallet } from '@/lib/jwk-utils';

type ClientsByChain = Record<string, AIAgentIdentityClient>;

const ClientsContext = React.createContext<ClientsByChain>({});

export function useAgentIdentityClients(): ClientsByChain {
  return React.useContext(ClientsContext);
}

// Convenience hook to get a client for a specific chain, with fallbacks
export function useAgentIdentityClientFor(chainIdHex?: string): AIAgentIdentityClient | null {
  const clients = useAgentIdentityClients();
  // Lazy import to avoid circular deps
  const { useAgentIdentityClient } = require('./AIAgentIdentityClientProvider') as typeof import('./AIAgentIdentityClientProvider');
  if (chainIdHex && clients[chainIdHex]) return clients[chainIdHex];
  const first = Object.keys(clients)[0];
  if (first) return clients[first];
  try {
    return useAgentIdentityClient?.() ?? null;
  } catch {
    return null;
  }
}

type ChainConfig = {
  chainIdHex: string;
  rpcUrl: string;
  identityRegistryAddress: `0x${string}`;
  ensRegistryAddress: `0x${string}`;
};

function getConfiguredChains(): ChainConfig[] {
  const chains: ChainConfig[] = [];

  const baseRpc = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string | undefined;
  const baseChainId = process.env.NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX as string | undefined;
  const baseIdentity = process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}` | undefined;
  const baseEns = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY as `0x${string}` | undefined;

  if (baseRpc && baseChainId && baseIdentity && baseEns) {
    chains.push({ chainIdHex: baseChainId, rpcUrl: baseRpc, identityRegistryAddress: baseIdentity, ensRegistryAddress: baseEns });
  }

  // Explicit support for Base Sepolia alongside ETH Sepolia
  const baseSepoliaRpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL as string | undefined;
  const baseSepoliaChainId = process.env.NEXT_PUBLIC_BASE_SEPOLIA_CHAIN_ID_HEX as string | undefined; // e.g., 0x14a34
  const baseSepoliaIdentity = process.env.NEXT_PUBLIC_BASE_SEPOLIA_IDENTITY_REGISTRY as `0x${string}` | undefined;
  const baseSepoliaEns = process.env.NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY as `0x${string}` | undefined;
  if (baseSepoliaRpc && baseSepoliaChainId && baseSepoliaIdentity && baseSepoliaEns) {
    chains.push({ chainIdHex: baseSepoliaChainId, rpcUrl: baseSepoliaRpc, identityRegistryAddress: baseSepoliaIdentity, ensRegistryAddress: baseSepoliaEns });
  }


  return chains;
}

type Props = { children: React.ReactNode };

export function AIAgentIdentityClientsProvider({ children }: Props) {
  const { provider: web3AuthProvider, address } = useWeb3Auth();
  const [clients, setClients] = React.useState<ClientsByChain>({});

  React.useEffect(() => {
    (async () => {
      if (!web3AuthProvider || !address) return;
      const chains = getConfiguredChains();
      if (!chains.length) return;

      const { ethers } = require('ethers') as typeof import('ethers');
      const orgPriv = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY as `0x${string}` | undefined;
      const result: ClientsByChain = {};

      let web3authPk: `0x${string}` | null = null;
      try {
        web3authPk = await extractPrivateKeyFromWallet(web3AuthProvider, address);
      } catch {}

      for (const cfg of chains) {
        const orgProvider = new ethers.JsonRpcProvider(cfg.rpcUrl);
        const orgSigner = orgPriv ? new ethers.Wallet(orgPriv, orgProvider) : undefined;
        const orgAdapter = orgSigner ? new EthersAdapter(orgProvider, orgSigner) : new EthersAdapter(orgProvider, undefined as any);

        let agentAdapter;
        if (web3authPk) {
          const agentSigner = new ethers.Wallet(web3authPk, orgProvider);
          agentAdapter = new EthersAdapter(orgProvider, agentSigner);
        } else {
          // Fallback to BrowserProvider for the first configured chain only
          try {
            const browserProvider = new ethers.BrowserProvider(web3AuthProvider as any);
            const agentSigner = await browserProvider.getSigner();
            agentAdapter = new EthersAdapter(browserProvider as any, agentSigner);
          } catch {
            continue;
          }
        }

        const client = new AIAgentIdentityClient(
          cfg.rpcUrl,
          agentAdapter,
          orgAdapter,
          cfg.identityRegistryAddress,
          cfg.ensRegistryAddress,
        );
        result[cfg.chainIdHex] = client;
      }

      setClients(result);
    })();
  }, [web3AuthProvider, address]);

  return (
    <ClientsContext.Provider value={clients}>
      {children}
    </ClientsContext.Provider>
  );
}


