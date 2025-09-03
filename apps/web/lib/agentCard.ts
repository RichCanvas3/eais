import { createPublicClient, http, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import type { PublicClient } from 'viem';
import { getAgentInfoByDomain } from './agentAdapter';
import { Web3Auth } from '@web3auth/modal';
import { personalSign } from 'viem/accounts';

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
  domain: string;
  rpcUrl?: string;
  chainId?: number; // default 11155111
  trustModels?: string[];
  // function to sign message with current EOA; returns 0x signature
  signMessage?: (message: string) => Promise<Hex>;
}): Promise<AgentCard> {
  const { registry, domain } = params;
  const rpcUrl = params.rpcUrl || (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
  const chain = sepolia;
  const publicClient: PublicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const card: AgentCard = {};

  const info = await getAgentInfoByDomain({ publicClient, registry, domain });
  if (info) {
    const caip10 = `eip155:${params.chainId ?? 11155111}:${info.agentAddress}`;
    const reg: AgentCard['registrations'][number] = {
      agentId: Number(info.agentId),
      agentAddress: caip10,
    } as any;

    if (params.signMessage) {
      try {
        const sig = await params.signMessage(domain);
        (reg as any).signature = sig;
      } catch {}
    }

    card.registrations = [reg as any];
  }

  if (params.trustModels && params.trustModels.length) {
    card.trustModels = params.trustModels;
  }

  return card;
}


