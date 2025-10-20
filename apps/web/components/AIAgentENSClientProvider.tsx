'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { AIAgentENSClient } from '../../erc8004-agentic-trust-sdk';

type Ctx = AIAgentENSClient | null;
const AIAgentENSClientContext = React.createContext<Ctx>(null);

export function useAgentENSClient(): AIAgentENSClient {
  const client = React.useContext(AIAgentENSClientContext);
  if (!client) throw new Error('useAIAgentENSClient must be used within AIAgentENSClientProvider');
  return client;
}



type Props = { children: React.ReactNode };

export function AIAgentENSClientProvider({ children }: Props) {
  const clientRef = React.useRef<AIAgentENSClient | null>(null);

  if (!clientRef.current) {
    const rpcUrl = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
    const ensRegistryAddress = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY as `0x${string}`;
    const identityRegistryAddress = process.env.NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY as `0x${string}`;
    const { ethers } = require('ethers') as typeof import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const adapter = new EthersAdapter(provider);
    clientRef.current = new AIAgentENSClient(rpcUrl, adapter, ensRegistryAddress, identityRegistryAddress);
  }

  return (
    <AIAgentENSClientContext.Provider value={clientRef.current}>
      {children}
    </AIAgentENSClientContext.Provider>
  );
}


