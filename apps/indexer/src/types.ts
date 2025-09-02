import type { Address } from "viem";

export type AgentRow = {
  agentId: string;           // store uint256 as DEC string for easy querying
  agentAddress: Address;
  owner?: Address;           // not in your ABI; keep optional for future
  agentDomain: string;
  metadataURI?: string | null; // optional for future
  createdAtBlock: number;
  createdAtTime: number;     // unix
};
