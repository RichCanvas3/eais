'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { AIAgentIdentityClient } from '../../erc8004-agentic-trust-sdk';
import { sepolia } from 'viem/chains';
import { http } from 'viem';
import { useWeb3Auth } from './Web3AuthProvider';
import { Chain } from 'viem';
import { chainConfig } from 'viem/zksync';

type Ctx = AIAgentIdentityClient | null;
const AgentIdentityClientContext = React.createContext<Ctx>(null);

export function useAgentIdentityClient(): AIAgentIdentityClient {
  const client = React.useContext(AgentIdentityClientContext);
  if (client) return client;
  // Provide a safe stub during pre-login so the UI can render
  const stub = React.useMemo(() => {
    const noop = async (..._args: any[]) => null as any;
    return {
      // Minimal subset used by UI; all return null-like values
      getAgentName: noop,
      getAgentAccount: noop,
      getAgentIdentityByName: async (_name: string) => ({ agentId: null, ensName: '', agentAccount: null }),
      getAgentAccountByName: noop,
      getAgentUrlByName: noop,
      getAgentEoaByAgentAccount: noop,
    } as unknown as AIAgentIdentityClient;
  }, []);
  return stub;
}

type Props = { children: React.ReactNode };

export function AIAgentIdentityClientProvider({ children }: Props) {
  const { provider: web3AuthProvider, address } = useWeb3Auth();
  const [client, setClient] = React.useState<AIAgentIdentityClient | null>(null);

  React.useEffect(() => {
    (async () => {
      // Require a connected wallet before attempting to get a signer
      if (!web3AuthProvider || !address || client) return;
      const identityRegistryAddress = process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
      const ensRegistryAddress = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY as `0x${string}`;
      const rpcUrl = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
      const { ethers } = require('ethers') as typeof import('ethers');

      // Org signer from env (server-managed)
      const orgProvider = new ethers.JsonRpcProvider(rpcUrl);
      const orgSigner = new ethers.Wallet(process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY as `0x${string}`, orgProvider);
      const orgAdapter = new EthersAdapter(orgProvider, orgSigner);

      // Agent signer from Web3Auth (browser EIP-1193)
      const browserProvider = new ethers.BrowserProvider(web3AuthProvider as any);
      const agentSigner = await browserProvider.getSigner();
      const agentAdapter = new EthersAdapter(browserProvider, agentSigner);

      console.log('********************* AIAgentIdentityClientProvider: agentAdapter', agentAdapter);
      console.log('********************* AIAgentIdentityClientProvider: orgAdapter', orgAdapter);
      console.log('********************* AIAgentIdentityClientProvider: ensRegistryAddress', ensRegistryAddress);
      console.log('********************* AIAgentIdentityClientProvider: identityRegistryAddress', identityRegistryAddress);
      console.log('********************* AIAgentIdentityClientProvider: rpcUrl', rpcUrl);

      // Construct client (constructor matches current AIAgentIdentityClient signature in your repo)
      const instance = new AIAgentIdentityClient(
        rpcUrl,
        agentAdapter,
        orgAdapter,
        identityRegistryAddress,
        ensRegistryAddress,
      );
      setClient(instance);
    })();
  }, [web3AuthProvider, address, client]);

  return client ? (
    <AgentIdentityClientContext.Provider value={client}>
      {children}
    </AgentIdentityClientContext.Provider>
  ) : (
    // Render the app so users can log in; context will be provided after connection
    <>{children}</>
  );
}

