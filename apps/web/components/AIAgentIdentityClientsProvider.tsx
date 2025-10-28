'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { AIAgentIdentityClient } from '../../erc8004-agentic-trust-sdk';
import { useWeb3Auth } from './Web3AuthProvider';
import { CHAIN_CONFIGS } from '../config/chains';

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

type Props = { children: React.ReactNode };

export function AIAgentIdentityClientsProvider({ children }: Props) {
  const { provider: web3AuthProvider, address } = useWeb3Auth();
  const [clients, setClients] = React.useState<ClientsByChain>({});
  const [isInitializing, setIsInitializing] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      if (!web3AuthProvider || !address) return;
      if (!CHAIN_CONFIGS.length) return;

      setIsInitializing(true);
      
      // Start with existing clients to avoid re-processing
      const result: ClientsByChain = { ...clients };
      
      console.info("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! AIAgentIdentityClientsProvider: chains", CHAIN_CONFIGS);
      
      // Process chains sequentially to avoid overwhelming the wallet
      for (const cfg of CHAIN_CONFIGS) {
        // Skip if client already exists for this chain
        if (result[cfg.chainIdHex]) {
          console.log(`✓ Client already exists for chain ${cfg.chainIdHex} (${cfg.chainName}), skipping`);
          continue;
        }

        console.log("🔍 Creating client for chain", cfg.chainIdHex, "(", cfg.chainName, ")");
        const client = new AIAgentIdentityClient(
          cfg.chainId,
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


