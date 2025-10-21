'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { AIAgentENSClient } from '../../erc8004-agentic-trust-sdk';
import { AIAgentL2ENSClient } from '../../erc8004-agentic-trust-sdk/AIAgentL2ENSClient';
import { useWeb3Auth } from './Web3AuthProvider';
import { sepolia, baseSepolia } from 'viem/chains';

type ENSClientsByChain = Record<string, AIAgentENSClient>;

const ENSClientsContext = React.createContext<ENSClientsByChain>({});

export function useAgentENSClients(): ENSClientsByChain {
  return React.useContext(ENSClientsContext);
}

// Convenience hook to get an ENS client for a specific chain, with fallbacks
export function useAgentENSClientFor(chainIdHex?: string): AIAgentENSClient | null {
  const clients = useAgentENSClients();
  // Lazy import to avoid circular deps
  const { useAgentENSClient } = require('./AIAgentENSClientProvider') as typeof import('./AIAgentENSClientProvider');
  if (chainIdHex && clients[chainIdHex]) return clients[chainIdHex];
  const first = Object.keys(clients)[0];
  if (first) return clients[first];
  try {
    return useAgentENSClient?.() ?? null;
  } catch {
    return null;
  }
}

type ChainConfig = {
  chainIdHex: string;
  rpcUrl: string;
  ensRegistryAddress: `0x${string}`;
  ensResolverAddress: `0x${string}`;
  identityRegistryAddress: `0x${string}`;
  chain: any; // viem chain object
};

function getConfiguredChains(): ChainConfig[] {
  const chains: ChainConfig[] = [];

  const ethSepoliaRpc = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string | undefined;
  const ethSepoliaChainId = process.env.NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX as string | undefined;
  const ethSepoliaIdentity = process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}` | undefined;
  const ethSepoliaEns = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY as `0x${string}` | undefined;
  const ethSepoliaResolver = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER as `0x${string}` | undefined;

  if (ethSepoliaRpc && ethSepoliaChainId && ethSepoliaIdentity && ethSepoliaEns && ethSepoliaResolver) {
    chains.push({ 
      chainIdHex: ethSepoliaChainId, 
      rpcUrl: ethSepoliaRpc, 
      identityRegistryAddress: ethSepoliaIdentity, 
      ensRegistryAddress: ethSepoliaEns,
      ensResolverAddress: ethSepoliaResolver,
      chain: sepolia
    });
  }

  // Explicit support for Base Sepolia alongside ETH Sepolia
  const baseSepoliaRpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL as string | undefined;
  const baseSepoliaChainId = process.env.NEXT_PUBLIC_BASE_SEPOLIA_CHAIN_ID_HEX as string | undefined; // e.g., 0x14a34
  const baseSepoliaIdentity = process.env.NEXT_PUBLIC_BASE_SEPOLIA_IDENTITY_REGISTRY as `0x${string}` | undefined;
  const baseSepoliaEns = process.env.NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY as `0x${string}` | undefined;
  const baseSepoliaResolver = process.env.NEXT_PUBLIC_BASE_SEPOLIA_ENS_RESOLVER as `0x${string}` | undefined;
  if (baseSepoliaRpc && baseSepoliaChainId && baseSepoliaIdentity && baseSepoliaEns && baseSepoliaResolver) {
    chains.push({ 
      chainIdHex: baseSepoliaChainId, 
      rpcUrl: baseSepoliaRpc, 
      identityRegistryAddress: baseSepoliaIdentity, 
      ensRegistryAddress: baseSepoliaEns,
      ensResolverAddress: baseSepoliaResolver,
      chain: baseSepolia
    });
  }

  return chains;
}

type Props = { children: React.ReactNode };

export function AIAgentENSClientsProvider({ children }: Props) {
  const { provider: web3AuthProvider, address } = useWeb3Auth();
  const [clients, setClients] = React.useState<ENSClientsByChain>({});

  React.useEffect(() => {
    (async () => {
      if (!web3AuthProvider || !address) return;
      const chains = getConfiguredChains();
      if (!chains.length) return;

      const { ethers } = require('ethers') as typeof import('ethers');
      const result: ENSClientsByChain = {};

      const eip1193 = web3AuthProvider as any;

      for (const cfg of chains) {
        console.log(`🔍 Processing ENS chain ${cfg.chainIdHex} (${cfg.rpcUrl})`);

        // Add and switch to the chain
        await eip1193.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: cfg.chainIdHex,
            chainName: cfg.chainIdHex === '0x14a34' ? "Base Sepolia" : "ETH Sepolia",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [cfg.rpcUrl]
          }]
        });
        await eip1193.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: cfg.chainIdHex }]
        });

        const ensProvider = new ethers.BrowserProvider(eip1193);
        const ensSigner = await ensProvider.getSigner();
        const ensAdapter = ensSigner ? new EthersAdapter(ensProvider, ensSigner) : new EthersAdapter(ensProvider, undefined as any);

        console.log("🔍 ENS agentAdapter: ", ensAdapter);
        
        // Use L2 client for Base Sepolia, standard client for others
        const client = cfg.chainIdHex === '0x14a34' 
          ? new AIAgentL2ENSClient(
              cfg.chain,
              cfg.rpcUrl,
              ensAdapter,
              cfg.ensRegistryAddress,
              cfg.ensResolverAddress,
              cfg.identityRegistryAddress
            )
          : new AIAgentENSClient(
              cfg.chain,
              cfg.rpcUrl,
              ensAdapter,
              cfg.ensRegistryAddress,
              cfg.ensResolverAddress,
              cfg.identityRegistryAddress
            );
        result[cfg.chainIdHex] = client;
      }

      setClients(result);
    })();
  }, [web3AuthProvider, address]);

  return (
    <ENSClientsContext.Provider value={clients}>
      {children}
    </ENSClientsContext.Provider>
  );
}
