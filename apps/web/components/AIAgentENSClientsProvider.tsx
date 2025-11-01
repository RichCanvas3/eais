'use client';
import * as React from 'react';
import { EthersAdapter } from '@erc8004/sdk';
import { AIAgentENSClient } from '@erc8004/agentic-trust-sdk';
import { AIAgentL2ENSDurenClient as AIAgentL2ENSClient } from '@erc8004/agentic-trust-sdk';
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
  
  if (chainIdHex && clients[chainIdHex]) {
    console.log(`🔍 Switching to ENS client for chain: ${chainIdHex}`);
    return clients[chainIdHex];
  }
  
  const first = Object.keys(clients)[0];
  if (first) {
    console.log(`🔍 Using first available ENS client: ${first}`);
    return clients[first];
  }
  
  try {
    return useAgentENSClient?.() ?? null;
  } catch {
    console.log('🔍 No ENS client available');
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
    
    // Use explicit environment variable access for each chain
    let ensRegistry: `0x${string}` | undefined;
    let ensResolver: `0x${string}` | undefined;
    
    switch (config.chainId) {
      case 11155111: // ETH_SEPOLIA
        ensRegistry = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY as `0x${string}` | undefined;
        ensResolver = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER as `0x${string}` | undefined;
        break;
      case 84532: // BASE_SEPOLIA
        ensRegistry = process.env.NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY as `0x${string}` | undefined;
        ensResolver = process.env.NEXT_PUBLIC_BASE_SEPOLIA_ENS_RESOLVER as `0x${string}` | undefined;
        break;
      case 11155420: // OP_SEPOLIA
        ensRegistry = process.env.NEXT_PUBLIC_OP_SEPOLIA_ENS_REGISTRY as `0x${string}` | undefined;
        ensResolver = process.env.NEXT_PUBLIC_OP_SEPOLIA_ENS_RESOLVER as `0x${string}` | undefined;
        break;
      default:
        console.warn(`🔍 Unknown chain ID: ${config.chainId}`);
        ensRegistry = undefined;
        ensResolver = undefined;
    }
    
    console.log(`🔍 Chain ${config.chainId} (${envPrefix}):`);
    console.log(`🔍   ENS Registry: ${ensRegistry || 'MISSING'}`);
    console.log(`🔍   ENS Resolver: ${ensResolver || 'MISSING'}`);
    
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
  console.log('🔍 AIAgentENSClientsProvider component mounted');
  const { provider: web3AuthProvider, address } = useWeb3Auth();
  const [clients, setClients] = React.useState<ENSClientsByChain>({});

  React.useEffect(() => {
    console.log('🔍 AIAgentENSClientsProvider useEffect triggered');
    console.log('🔍 web3AuthProvider:', !!web3AuthProvider);
    console.log('🔍 address:', address);
    console.log('🔍 web3AuthProvider type:', typeof web3AuthProvider);
    
    (async () => {
      if (!web3AuthProvider || !address) {
        console.log('🔍 Skipping ENS client creation - missing provider or address');
        return;
      }
      
      console.log('🔍 Starting ENS client creation...');
      const chains = getConfiguredChains();
      console.log('🔍 Configured chains:', chains.length);
      if (!chains.length) {
        console.log('🔍 No chains configured');
        return;
      }

      const { ethers } = require('ethers') as typeof import('ethers');
      const result: ENSClientsByChain = {};

      const eip1193 = web3AuthProvider as any;

      for (const cfg of chains) {
        console.log(`🔍 Creating ENS client for chain ${cfg.chainIdHex} (${cfg.chain.name})`);

        // Add and switch to the chain for signing operations
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

        // Wait a bit to ensure chain switch is complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Create wallet provider for signing operations
        const walletProvider = new ethers.BrowserProvider(eip1193);
        const walletSigner = await walletProvider.getSigner();
        const walletAdapter = walletSigner ? new EthersAdapter(walletProvider, walletSigner) : new EthersAdapter(walletProvider, undefined as any);

        // Create direct RPC provider for reading operations
        const readProvider = new ethers.JsonRpcProvider(cfg.rpcUrl);
        
        // Create a hybrid adapter that uses wallet for signing and direct RPC for reading
        const hybridAdapter = {
          // Use wallet adapter for signing operations
          signMessage: walletAdapter.signMessage?.bind(walletAdapter),
          // Use direct RPC provider for reading operations
          provider: readProvider,
          getAddress: () => Promise.resolve(address)
        };

        console.log(`🔍 Created hybrid ENS adapter for ${cfg.chain.name} (${cfg.chainIdHex})`);
        
        // Create the appropriate ENS client for this chain
        const client = cfg.networkType === 'L2' 
          ? new AIAgentL2ENSClient(
              cfg.chain,
              cfg.rpcUrl,
              hybridAdapter as any,
              cfg.ensRegistryAddress,
              cfg.ensResolverAddress,
              cfg.identityRegistryAddress
            )
          : new AIAgentENSClient(
              cfg.chain,
              cfg.rpcUrl,
              hybridAdapter as any,
              cfg.ensRegistryAddress,
              cfg.ensResolverAddress,
              cfg.identityRegistryAddress
            );
        
        result[cfg.chainIdHex] = client;
        console.log(`✅ ENS client created for ${cfg.chain.name} (${cfg.chainIdHex})`);
      }

      setClients(result);
      console.log('🔍 ENS clients created successfully:', Object.keys(result));
    })();
  }, [web3AuthProvider, address]);

  return (
    <ENSClientsContext.Provider value={clients}>
      {children}
    </ENSClientsContext.Provider>
  );
}
