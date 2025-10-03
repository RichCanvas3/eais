import type { Abi } from "viem";

export const identityRegistryAbi = [
  // --- ERC721 Standard Events ---
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "approved", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: true }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ApprovalForAll",
    inputs: [
      { name: "owner", type: "address", indexed: true },
      { name: "operator", type: "address", indexed: true },
      { name: "approved", type: "bool", indexed: false }
    ],
    anonymous: false
  },

  // --- IdentityRegistry custom events ---
  {
    type: "event",
    name: "MetadataSet",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "key", type: "bytes32", indexed: true },
      { name: "value", type: "bytes", indexed: false }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "MetadataDeleted",
    inputs: [
      { name: "agentId", type: "uint256", indexed: true },
      { name: "key", type: "bytes32", indexed: true }
    ],
    anonymous: false
  },

  // --- ERC165 ---
  {
    type: "function",
    name: "supportsInterface",
    stateMutability: "view",
    inputs: [{ name: "interfaceId", type: "bytes4" }],
    outputs: [{ name: "", type: "bool" }]
  },

  // --- ERC721 Metadata ---
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "string" }]
  },

  // --- ERC721 Core ---
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "getApproved", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "isApprovedForAll", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }], outputs: [] },
  { type: "function", name: "transferFrom", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "safeTransferFrom", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [] },

  // --- IdentityRegistry helpers ---
  {
    type: "function",
    name: "registryChainId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint64" }]
  },
  {
    type: "function",
    name: "identityRegistryAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "exists",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }]
  },

  // --- Admin minting ---
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [{ name: "agentId", type: "uint256" }]
  },
  {
    type: "function",
    name: "mintWithURI",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "uri", type: "string" }],
    outputs: [{ name: "agentId", type: "uint256" }]
  },
  {
    type: "function",
    name: "setNextId",
    stateMutability: "nonpayable",
    inputs: [{ name: "nextId_", type: "uint256" }],
    outputs: []
  },

  // --- Controller/operator actions ---
  {
    type: "function",
    name: "setTokenURI",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "uint256" }, { name: "uri", type: "string" }],
    outputs: []
  },


  // --- On-chain metadata ---
  {
    type: "function",
    name: "setMetadata",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "key", type: "bytes32" },
      { name: "value", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "deleteMetadata",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "key", type: "bytes32" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "getMetadata",
    stateMutability: "view",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "key", type: "bytes32" }
    ],
    outputs: [{ name: "", type: "bytes" }]
  }
] as const satisfies Abi;

export default identityRegistryAbi;