import type { Abi } from "viem";

export const reputationRegistryAbi = [
    // Write API
    {
      type: 'function',
      name: 'giveFeedback',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'agentId', type: 'uint256' },
        { name: 'score', type: 'uint8' },
        { name: 'tag1', type: 'bytes32' },
        { name: 'tag2', type: 'bytes32' },
        { name: 'fileuri', type: 'string' },
        { name: 'filehash', type: 'bytes32' },
        { name: 'feedbackAuth', type: 'bytes' },
      ],
      outputs: [],
    },
    {
      type: 'function',
      name: 'revokeFeedback',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'agentId', type: 'uint256' },
        { name: 'feedbackIndex', type: 'uint64' },
      ],
      outputs: [],
    },
    {
      type: 'function',
      name: 'appendResponse',
      stateMutability: 'nonpayable',
      inputs: [
        { name: 'agentId', type: 'uint256' },
        { name: 'clientAddress', type: 'address' },
        { name: 'feedbackIndex', type: 'uint64' },
        { name: 'responseUri', type: 'string' },
        { name: 'responseHash', type: 'bytes32' },
      ],
      outputs: [],
    },
    // Read API
    {
      type: 'function',
      name: 'getSummary',
      stateMutability: 'view',
      inputs: [
        { name: 'agentId', type: 'uint256' },
        { name: 'clientAddresses', type: 'address[]' },
        { name: 'tag1', type: 'bytes32' },
        { name: 'tag2', type: 'bytes32' },
      ],
      outputs: [
        { name: 'count', type: 'uint64' },
        { name: 'averageScore', type: 'uint8' },
      ],
    },
    {
      type: 'function',
      name: 'readFeedback',
      stateMutability: 'view',
      inputs: [
        { name: 'agentId', type: 'uint256' },
        { name: 'clientAddress', type: 'address' },
        { name: 'index', type: 'uint64' },
      ],
      outputs: [
        { name: 'score', type: 'uint8' },
        { name: 'tag1', type: 'bytes32' },
        { name: 'tag2', type: 'bytes32' },
        { name: 'isRevoked', type: 'bool' },
      ],
    },
    {
      type: 'function',
      name: 'readAllFeedback',
      stateMutability: 'view',
      inputs: [
        { name: 'agentId', type: 'uint256' },
        { name: 'clientAddresses', type: 'address[]' },
        { name: 'tag1', type: 'bytes32' },
        { name: 'tag2', type: 'bytes32' },
        { name: 'includeRevoked', type: 'bool' },
      ],
      outputs: [
        { name: 'outClients', type: 'address[]' },
        { name: 'scores', type: 'uint8[]' },
        { name: 'tag1s', type: 'bytes32[]' },
        { name: 'tag2s', type: 'bytes32[]' },
        { name: 'revokedStatuses', type: 'bool[]' },
      ],
    },
    {
      type: 'function',
      name: 'getResponseCount',
      stateMutability: 'view',
      inputs: [
        { name: 'agentId', type: 'uint256' },
        { name: 'clientAddress', type: 'address' },
        { name: 'feedbackIndex', type: 'uint64' },
        { name: 'responders', type: 'address[]' },
      ],
      outputs: [
        { name: 'count', type: 'uint64' },
      ],
    },
    {
      type: 'function',
      name: 'getClients',
      stateMutability: 'view',
      inputs: [ { name: 'agentId', type: 'uint256' } ],
      outputs: [ { name: 'clients', type: 'address[]' } ],
    },
    {
      type: 'function',
      name: 'getLastIndex',
      stateMutability: 'view',
      inputs: [
        { name: 'agentId', type: 'uint256' },
        { name: 'clientAddress', type: 'address' },
      ],
      outputs: [ { name: 'index', type: 'uint64' } ],
    },
    {
      type: 'function',
      name: 'getIdentityRegistry',
      stateMutability: 'view',
      inputs: [],
      outputs: [ { name: 'identityRegistry', type: 'address' } ],
    },
  ] as const satisfies Abi;