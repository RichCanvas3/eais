'use client';
import * as React from 'react';
import { EthersAdapter } from '../../erc8004-src';
import { OrgIdentityClient } from '../../erc8004-agentic-trust-sdk';

type Ctx = OrgIdentityClient | null;
const OrgIdentityClientContext = React.createContext<Ctx>(null);

export function useOrgIdentityClient(): OrgIdentityClient {
  const client = React.useContext(OrgIdentityClientContext);
  if (!client) throw new Error('useOrgIdentityClient must be used within OrgIdentityClientProvider');
  return client;
}

type Props = { children: React.ReactNode };

export function OrgIdentityClientProvider({ children }: Props) {
  const clientRef = React.useRef<OrgIdentityClient | null>(null);

  if (!clientRef.current) {
    const rpcUrl = process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL as string;
    const ensRegistry = process.env.NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY as `0x${string}`;
    const { ethers } = require('ethers') as typeof import('ethers');
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const adapter = new EthersAdapter(provider);
    clientRef.current = new OrgIdentityClient(adapter as any, { ensRegistry });
  }

  return (
    <OrgIdentityClientContext.Provider value={clientRef.current}>
      {children}
    </OrgIdentityClientContext.Provider>
  );
}


