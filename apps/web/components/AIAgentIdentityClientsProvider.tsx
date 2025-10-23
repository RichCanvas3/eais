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
  chainName: string;
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
    chains.push({ 
      chainIdHex: baseChainId, 
      chainName: "Ethereum Sepolia",
      rpcUrl: baseRpc, 
      identityRegistryAddress: baseIdentity, 
      ensRegistryAddress: baseEns 
    });
  }

  // Explicit support for Base Sepolia alongside ETH Sepolia
  const baseSepoliaRpc = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL as string | undefined;
  const baseSepoliaChainId = process.env.NEXT_PUBLIC_BASE_SEPOLIA_CHAIN_ID_HEX as string | undefined; // e.g., 0x14a34
  const baseSepoliaIdentity = process.env.NEXT_PUBLIC_BASE_SEPOLIA_IDENTITY_REGISTRY as `0x${string}` | undefined;
  const baseSepoliaEns = process.env.NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY as `0x${string}` | undefined;
  if (baseSepoliaRpc && baseSepoliaChainId && baseSepoliaIdentity && baseSepoliaEns) {
    chains.push({ 
      chainIdHex: baseSepoliaChainId, 
      chainName: "Base Sepolia",
      rpcUrl: baseSepoliaRpc, 
      identityRegistryAddress: baseSepoliaIdentity, 
      ensRegistryAddress: baseSepoliaEns 
    });
  }


  return chains;
}

type Props = { children: React.ReactNode };

export function AIAgentIdentityClientsProvider({ children }: Props) {
  const { provider: web3AuthProvider, address } = useWeb3Auth();
  const [clients, setClients] = React.useState<ClientsByChain>({});
  const [isInitializing, setIsInitializing] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      if (!web3AuthProvider || !address) return;
      const chains = getConfiguredChains();
      if (!chains.length) return;

      setIsInitializing(true);
      
      const { ethers } = require('ethers') as typeof import('ethers');
      const orgPriv = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY as `0x${string}` | undefined;
      
      // Start with existing clients to avoid re-processing
      const result: ClientsByChain = { ...clients };

      /*
      let web3authPk: `0x${string}` | null = null;
      try {

        console.log('🔍 AAAA Extracting private key from wallet:', web3AuthProvider, address);
        web3authPk = await extractPrivateKeyFromWallet(web3AuthProvider, address);
        console.log('🔍 Private key extraction result:', web3authPk ? 'SUCCESS' : 'FAILED');
      } catch (error) {
        console.error('❌ Error extracting private key:', error);
      }
      */

      const eip1193 = web3AuthProvider as any;
      

      console.info("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! AIAgentIdentityClientsProvider: chains", chains);
      
      // Process chains sequentially to avoid overwhelming the wallet
      for (const cfg of chains) {
        // Skip if client already exists for this chain
        if (result[cfg.chainIdHex]) {
          console.log(`✓ Client already exists for chain ${cfg.chainIdHex} (${cfg.chainName}), skipping`);
          continue;
        }
 
        /*
        console.log(`🔍 Processing chain ${cfg.chainIdHex} (${cfg.chainName}) at ${cfg.rpcUrl}`);

        // Use Promise.allSettled to handle wallet operations without blocking
        const walletOps = await Promise.allSettled([
          eip1193.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: cfg.chainIdHex,            
              chainName: cfg.chainName,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [cfg.rpcUrl]
            }]
          }),
          eip1193.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: cfg.chainIdHex }]
          })
        ]);

        // Check if wallet operations succeeded
        const [addResult, switchResult] = walletOps;
        if (addResult.status === 'rejected') {
          console.warn(`Failed to add chain ${cfg.chainName}:`, addResult.reason);
        }
        if (switchResult.status === 'rejected') {
          console.warn(`Failed to switch to chain ${cfg.chainName}:`, switchResult.reason);
        }

        // Use a shorter, non-blocking delay
        await new Promise(resolve => setTimeout(resolve, 200));

        const agentProvider = new ethers.BrowserProvider(eip1193);
        const agentSigner = await agentProvider.getSigner();
        const agentAdapter = agentSigner ? new EthersAdapter(agentProvider, agentSigner) : new EthersAdapter(agentProvider, undefined as any);
        
        // Check if the adapter's chain ID matches the expected chain ID
        const adapterChainId = await agentAdapter.getChainId();
        const expectedChainId = parseInt(cfg.chainIdHex, 16);
        console.info("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! AIAgentIdentityClientsProvider: agentAdapter chainId", adapterChainId);
        console.info("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! AIAgentIdentityClientsProvider: expected chainId", expectedChainId);
        
        if (adapterChainId !== expectedChainId) {
          console.error(`❌ Chain ID mismatch for ${cfg.chainName}! Expected: ${expectedChainId} (${cfg.chainIdHex}), Got: ${adapterChainId}`);
          continue; // Skip this chain and don't create a client
        }
        */

        console.log("🔍 Created adapter for chain", cfg.chainIdHex, "with RPC", cfg.rpcUrl);
        const chainId = parseInt(cfg.chainIdHex, 16);
        const client = new AIAgentIdentityClient(
          chainId,
          cfg.rpcUrl,
          cfg.identityRegistryAddress
        );
        result[cfg.chainIdHex] = client;
      }

      // Only update state if something changed
      if (Object.keys(result).length !== Object.keys(clients).length) {
        setClients(result);
      }
      
      setIsInitializing(false);
    })();
  }, [web3AuthProvider, address]);

  return (
    <ClientsContext.Provider value={clients}>
      {children}
    </ClientsContext.Provider>
  );
}


