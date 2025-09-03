import type { Abi } from "viem";

export const identityRegistryAbi = [
  {
    type: "event",
    name: "AgentRegistered",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentDomain", type: "string", indexed: false },
      { name: "agentAddress", type: "address", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "AgentUpdated",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "agentDomain", type: "string", indexed: false },
      { name: "agentAddress", type: "address", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "function",
    name: "getAgent",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "agentInfo",
        type: "tuple",
        components: [
          { name: "agentId", type: "uint256" },
          { name: "agentDomain", type: "string" },
          { name: "agentAddress", type: "address" }
        ]
      }
    ]
  },
  { type: "function", name: "agentExists", stateMutability: "view", inputs: [{ name: "agentId", type: "uint256" }], outputs: [{ name: "exists", type: "bool" }] },
  { type: "function", name: "getAgentCount", stateMutability: "view", inputs: [], outputs: [{ name: "count", type: "uint256" }] },
  { type: "function", name: "resolveByAddress", stateMutability: "view", inputs: [{ name: "agentAddress", type: "address" }], outputs: [{ name: "agentInfo", type: "tuple", components: [ { name: "agentId", type: "uint256" }, { name: "agentDomain", type: "string" }, { name: "agentAddress", type: "address" } ] }] },
  { type: "function", name: "resolveByDomain", stateMutability: "view", inputs: [{ name: "agentDomain", type: "string" }], outputs: [{ name: "agentInfo", type: "tuple", components: [ { name: "agentId", type: "uint256" }, { name: "agentDomain", type: "string" }, { name: "agentAddress", type: "address" } ] }] },
  // Assumed write API matching events: register an agent with a domain and address
  { type: "function", name: "registerByDomain", stateMutability: "nonpayable", inputs: [ { name: "agentDomain", type: "string" }, { name: "agentAddress", type: "address" } ], outputs: [] }
] as const satisfies Abi;


