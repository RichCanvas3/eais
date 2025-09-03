import { createPublicClient, createWalletClient, custom, http, type Address } from "viem";
import { identityRegistryAbi } from "@/lib/abi/identityRegistry";

export type AgentInfo = {
  agentId: bigint;
  agentDomain: string;
  agentAddress: Address;
};

export type AgentAdapterConfig = {
  registryAddress: Address;
  rpcUrl?: string;
};

export function createAgentAdapter(config: AgentAdapterConfig) {
  const transport = config.rpcUrl ? http(config.rpcUrl) : http();
  const publicClient = createPublicClient({ transport });

  async function getAgentCount(): Promise<bigint> {
    return await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "getAgentCount",
      args: [],
    }) as bigint;
  }

  async function getAgent(agentId: bigint): Promise<AgentInfo> {
    const res = await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "getAgent",
      args: [agentId],
    }) as any;
    return {
      agentId: BigInt(res.agentId ?? agentId),
      agentDomain: res.agentDomain,
      agentAddress: res.agentAddress as Address,
    };
  }

  async function resolveByDomain(agentDomain: string): Promise<AgentInfo> {
    const res = await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "resolveByDomain",
      args: [agentDomain],
    }) as any;
    return {
      agentId: BigInt(res.agentId),
      agentDomain: res.agentDomain,
      agentAddress: res.agentAddress as Address,
    };
  }

  async function resolveByAddress(agentAddress: Address): Promise<AgentInfo> {
    const res = await publicClient.readContract({
      address: config.registryAddress,
      abi: identityRegistryAbi,
      functionName: "resolveByAddress",
      args: [agentAddress],
    }) as any;
    return {
      agentId: BigInt(res.agentId),
      agentDomain: res.agentDomain,
      agentAddress: res.agentAddress as Address,
    };
  }

  function getWalletClient() {
    if (typeof window === "undefined") return null;
    if (!window.ethereum) return null;
    return createWalletClient({ transport: custom(window.ethereum) });
  }

  return {
    publicClient,
    getAgentCount,
    getAgent,
    resolveByDomain,
    resolveByAddress,
    getWalletClient,
  };
}


