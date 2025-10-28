'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { AIAgentENSClient } from '../../erc8004-agentic-trust-sdk';
import { AIAgentL2ENSClient } from '../../erc8004-agentic-trust-sdk/AIAgentL2ENSClient';
import { useWeb3Auth } from './Web3AuthProvider';
import { CHAIN_CONFIGS, getChainConfigByHex, getNetworkType } from '../config/chains';

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

type ENSChainConfig = {
  chainIdHex: string;
  rpcUrl: string;
  ensRegistryAddress: `0x${string}`;
  ensResolverAddress: `0x${string}`;
  identityRegistryAddress: `0x${string}`;
  chain: any; // viem chain object
  networkType: 'L1' | 'L2';
};

function getConfiguredChains(): ENSChainConfig[] {
  const chains: ENSChainConfig[] = [];

  // Use centralized chain configuration
  for (const config of CHAIN_CONFIGS) {
    // Map chain IDs to environment variable prefixes
    const getEnvPrefix = (chainId: number): string => {
      switch (chainId) {
        case 11155111: return 'ETH_SEPOLIA';
        case 84532: return 'BASE_SEPOLIA';
        case 11155420: return 'OP_SEPOLIA';
        default: return 'UNKNOWN';
      }
    };
    
    const envPrefix = getEnvPrefix(config.chainId);
    const ensRegistry = process.env[`NEXT_PUBLIC_${envPrefix}_ENS_REGISTRY`] as `0x${string}` | undefined;
    const ensResolver = process.env[`NEXT_PUBLIC_${envPrefix}_ENS_RESOLVER`] as `0x${string}` | undefined;
    
    if (ensRegistry && ensResolver) {
      chains.push({
        chainIdHex: config.chainIdHex,
        rpcUrl: config.rpcUrl,
        identityRegistryAddress: config.identityRegistryAddress,
        ensRegistryAddress: ensRegistry,
        ensResolverAddress: ensResolver,
        chain: config.viemChain,
        networkType: config.networkType
      });
    }
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
            chainName: getChainConfigByHex(cfg.chainIdHex)?.chainName || "ETH Sepolia",
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
        
        // Use L2 client for L2 networks, standard client for L1 networks
        const client = cfg.networkType === 'L2' 
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
