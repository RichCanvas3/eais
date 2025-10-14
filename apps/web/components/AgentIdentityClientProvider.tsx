'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { AgentIdentityClient } from '../../erc8004-agentic-trust-sdk';
import { sepolia } from 'viem/chains';
import { http } from 'viem';
import { useWeb3Auth } from './Web3AuthProvider';
import { Chain } from 'viem';
import { chainConfig } from 'viem/zksync';

type Ctx = AgentIdentityClient | null;
const AgentIdentityClientContext = React.createContext<Ctx>(null);

export function useAgentIdentityClient(): AgentIdentityClient {
  const client = React.useContext(AgentIdentityClientContext);
  if (!client) throw new Error('useAgentIdentityClient must be used within AgentIdentityClientProvider');
  return client;
}

type Props = { children: React.ReactNode };

export function AgentIdentityClientProvider({ children }: Props) {
  const { provider } = useWeb3Auth();
  const [client, setClient] = React.useState<AgentIdentityClient | null>(null);

  React.useEffect(() => {
    (async () => {
      if (!provider || client) return;
      const identityRegistryAddress = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY as `0x${string}`;
      const ensRegistryAddress = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
      const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL!;
      const { ethers } = require('ethers') as typeof import('ethers');

      // Org signer from env (server-managed)
      const orgProvider = new ethers.JsonRpcProvider(rpcUrl);
      const orgSigner = new ethers.Wallet(process.env.NEXT_PUBLIC_ENS_PRIVATE_KEY! as `0x${string}`, orgProvider);
      const orgAdapter = new EthersAdapter(orgProvider, orgSigner);

      // Agent signer from Web3Auth (browser EIP-1193)
      const browserProvider = new ethers.BrowserProvider(provider as any);
      const agentSigner = await browserProvider.getSigner();
      const agentAdapter = new EthersAdapter(browserProvider, agentSigner);

      // Construct client (constructor matches current AgentIdentityClient signature in your repo)
      const instance = new AgentIdentityClient(
        rpcUrl,
        orgAdapter,
        agentAdapter,
        ensRegistryAddress,
        identityRegistryAddress,
      );
      setClient(instance);
    })();
  }, [provider, client]);

  return (
    client ? (
      <AgentIdentityClientContext.Provider value={client}>
        {children}
      </AgentIdentityClientContext.Provider>
    ) : null
  );
}


