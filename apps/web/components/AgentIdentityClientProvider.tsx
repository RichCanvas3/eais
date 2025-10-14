'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { AgentIdentityClient } from '../../erc8004-agentic-trust-sdk';

type Ctx = AgentIdentityClient | null;
const AgentIdentityClientContext = React.createContext<Ctx>(null);

export function useAgentIdentityClient(): AgentIdentityClient {
  const client = React.useContext(AgentIdentityClientContext);
  if (!client) throw new Error('useAgentIdentityClient must be used within AgentIdentityClientProvider');
  return client;
}

type Props = { children: React.ReactNode };

export function AgentIdentityClientProvider({ children }: Props) {
  const clientRef = React.useRef<AgentIdentityClient | null>(null);

  if (!clientRef.current) {
    const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
    const registry = process.env.NEXT_PUBLIC_IDENTITY_REGISTRY as string;
    const ensRegistry = (process.env.NEXT_PUBLIC_ENS_REGISTRY as `0x${string}`) || '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
    const { ethers } = require('ethers') as typeof import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const adapter = new EthersAdapter(provider);
    clientRef.current = new AgentIdentityClient(adapter as any, registry, { ensRegistry });
  }

  return (
    <AgentIdentityClientContext.Provider value={clientRef.current}>
      {children}
    </AgentIdentityClientContext.Provider>
  );
}


