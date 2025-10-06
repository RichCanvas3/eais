import { createPublicClient, http, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import type { PublicClient } from 'viem';
import { getAgentInfoByName } from './agentAdapter';
import { Web3Auth } from '@web3auth/modal';

export type AgentCard = {
  registrations?: Array<{
    agentId: number;
    agentAddress: string; // CAIP-10
    signature?: Hex;
  }>;
  trustModels?: string[];
  [k: string]: any;
};

export async function buildAgentCard(params: {
  registry: `0x${string}`;
  agentName: string;
  rpcUrl?: string;
  chainId?: number; // default 11155111
  trustModels?: string[];
  // function to sign message with current EOA; returns 0x signature
  signMessage?: (message: string) => Promise<Hex>;
  // Optional: if provided, start by fetching this JSON as the base agent card
  a2aUrl?: string;
}): Promise<AgentCard> {
  const { registry, agentName } = params;
  const rpcUrl = params.rpcUrl || (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
  const chain = sepolia;
  const publicClient: PublicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  let card: AgentCard = {};

  // If an A2A URL is provided, try to fetch and use it as the base
  if (params.a2aUrl && /^https?:\/\//i.test(params.a2aUrl)) {
    try {
      const res = await fetch(params.a2aUrl);
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === 'object' && !Array.isArray(json)) {
          card = { ...(json as any) } as AgentCard;
        }
      }
    } catch {}
  }

  const info = await getAgentInfoByName({ publicClient, registry, agentName });
  if (info) {
    const caip10AgentAddress = `eip155:${params.chainId ?? 11155111}:${info.agentAddress}`;
    const reg: { agentId: number; agentAddress: string; signature?: Hex } = {
      agentId: Number(info.agentId),
      agentAddress: caip10AgentAddress,
    };

    if (params.signMessage) {
      try {
        const sig = await params.signMessage(agentName);
        (reg as any).signature = sig;
      } catch {}
    }

    // Merge/append registration into base card
    const baseRegs = Array.isArray((card as any).registrations) ? ([...(card as any).registrations] as any[]) : [];
    const existingIdx = baseRegs.findIndex((r: any) => Number(r?.agentId) === Number(reg.agentId));
    if (existingIdx >= 0) {
      baseRegs[existingIdx] = { ...baseRegs[existingIdx], ...reg };
    } else {
      baseRegs.push(reg);
    }
    (card as any).registrations = baseRegs;
  }

  if (params.trustModels && params.trustModels.length) {
    if (Array.isArray((card as any).trustModels)) {
      const merged = new Set<string>([...((card as any).trustModels as string[]), ...params.trustModels]);
      (card as any).trustModels = Array.from(merged);
    } else {
      (card as any).trustModels = params.trustModels;
    }
  }

  return card;
}


