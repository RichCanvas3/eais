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
      

      for (const cfg of chains) {
        console.log(`🔍 Processing chain ${cfg.chainIdHex} (${cfg.rpcUrl})`);

        cfg.rpcUrl
        await eip1193.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: cfg.chainIdHex,            // 84532
              chainName: "Base Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [cfg.rpcUrl]
            }]
          });
          await eip1193.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: cfg.chainIdHex }]
          });

        const agentProvider = new ethers.BrowserProvider(eip1193);
        const agentSigner = await agentProvider.getSigner();
        const agentAdapter = agentSigner ? new EthersAdapter(agentProvider, agentSigner) : new EthersAdapter(agentProvider, undefined as any);


        console.log("🔍 AAAA agentAdapter: ", agentAdapter);
        const client = new AIAgentIdentityClient(
          cfg.rpcUrl,
          agentAdapter,
          cfg.identityRegistryAddress
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


