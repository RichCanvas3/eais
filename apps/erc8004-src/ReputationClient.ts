/**
 * Reputation Client for ERC-8004
 * Handles feedback submission and reputation queries
 */

import { BlockchainAdapter } from './adapters/types';
import { FeedbackAuth } from './types';
import ReputationRegistryABI from './abis/ReputationRegistry.json';
import { ethers } from 'ethers';

export interface GiveFeedbackParams {
  agentId: bigint;
  score: number; // MUST be 0-100
  tag1?: string; // OPTIONAL (bytes32)
  tag2?: string; // OPTIONAL (bytes32)
  feedbackUri?: string; // OPTIONAL
  feedbackHash?: string; // OPTIONAL (bytes32, KECCAK-256 of feedbackUri content)
  feedbackAuth: string; // Signed feedbackAuth
}

export class ReputationClient {
  private adapter: BlockchainAdapter;
  private contractAddress: string;
  private identityRegistryAddress: string;

  constructor(
    adapter: BlockchainAdapter,
    contractAddress: string,
    identityRegistryAddress: string
  ) {
    this.adapter = adapter;
    this.contractAddress = contractAddress;
    this.identityRegistryAddress = identityRegistryAddress;
  }

  /**
   * Create a feedbackAuth structure to be signed
   * Spec: tuple (agentId, clientAddress, indexLimit, expiry, chainId, identityRegistry, signerAddress)
   *
   * @param agentId - The agent ID
   * @param clientAddress - Address authorized to give feedback
   * @param indexLimit - Must be > last feedback index from this client (typically lastIndex + 1)
   * @param expiry - Unix timestamp when authorization expires
   * @param chainId - Chain ID where feedback will be submitted
   * @param signerAddress - Address of the signer (agent owner/operator)
   */
  createFeedbackAuth(
    agentId: bigint,
    clientAddress: string,
    indexLimit: bigint,
    expiry: bigint,
    chainId: bigint,
    signerAddress: string
  ): FeedbackAuth {
    return {
      agentId,
      clientAddress,
      indexLimit,
      expiry,
      chainId,
      identityRegistry: this.identityRegistryAddress,
      signerAddress,
    };
  }

  /**
   * Sign a feedbackAuth using EIP-191
   * The agent owner/operator signs to authorize a client to give feedback
   *
   * @param auth - The feedbackAuth structure
   * @returns Signed authorization as bytes (encoded tuple + signature)
   */
  async signFeedbackAuth(auth: FeedbackAuth): Promise<string> {
    // Encode the feedbackAuth tuple
    // Spec: (agentId, clientAddress, indexLimit, expiry, chainId, identityRegistry, signerAddress)
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'uint256', 'uint256', 'address', 'address'],
      [
        auth.agentId,
        auth.clientAddress,
        auth.indexLimit,
        auth.expiry,
        auth.chainId,
        auth.identityRegistry,
        auth.signerAddress,
      ]
    );

    // Hash the encoded data
    const messageHash = ethers.keccak256(encoded);

    // Sign using EIP-191 (personal_sign)
    // This prefixes the message with "\x19Ethereum Signed Message:\n32"
    const signature = await this.adapter.signMessage(ethers.getBytes(messageHash));

    // Return encoded tuple + signature concatenated
    // Contract will decode the tuple and verify the signature
    return ethers.concat([encoded, signature]);
  }

  /**
   * Submit feedback for an agent
   * Spec: function giveFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string calldata feedbackUri, bytes32 calldata feedbackHash, bytes memory feedbackAuth)
   *
   * @param params - Feedback parameters (score is MUST, others are OPTIONAL)
   * @returns Transaction result
   */
  async giveFeedback(params: GiveFeedbackParams): Promise<{ txHash: string }> {
    // Validate score is 0-100 (MUST per spec)
    if (params.score < 0 || params.score > 100) {
      throw new Error('Score MUST be between 0 and 100');
    }

    // Convert optional string parameters to bytes32 (or empty bytes32 if not provided)
    const tag1 = params.tag1 ? ethers.id(params.tag1).slice(0, 66) : ethers.ZeroHash;
    const tag2 = params.tag2 ? ethers.id(params.tag2).slice(0, 66) : ethers.ZeroHash;
    const feedbackHash = params.feedbackHash || ethers.ZeroHash;
    const feedbackUri = params.feedbackUri || '';

    const result = await this.adapter.send(
      this.contractAddress,
      ReputationRegistryABI,
      'giveFeedback',
      [
        params.agentId,
        params.score,
        tag1,
        tag2,
        feedbackUri,
        feedbackHash,
        params.feedbackAuth,
      ]
    );

    return { txHash: result.txHash };
  }

  /**
   * Revoke previously submitted feedback
   * Spec: function revokeFeedback(uint256 agentId, uint64 feedbackIndex)
   *
   * @param agentId - The agent ID
   * @param feedbackIndex - Index of feedback to revoke
   */
  async revokeFeedback(agentId: bigint, feedbackIndex: bigint): Promise<{ txHash: string }> {
    const result = await this.adapter.send(
      this.contractAddress,
      ReputationRegistryABI,
      'revokeFeedback',
      [agentId, feedbackIndex]
    );

    return { txHash: result.txHash };
  }

  /**
   * Append a response to existing feedback
   * Spec: function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string calldata responseUri, bytes32 calldata responseHash)
   *
   * @param agentId - The agent ID
   * @param clientAddress - Client who gave the feedback
   * @param feedbackIndex - Index of the feedback
   * @param responseUri - URI to response content
   * @param responseHash - OPTIONAL hash of response content (KECCAK-256)
   */
  async appendResponse(
    agentId: bigint,
    clientAddress: string,
    feedbackIndex: bigint,
    responseUri: string,
    responseHash?: string
  ): Promise<{ txHash: string }> {
    const hash = responseHash || ethers.ZeroHash;

    const result = await this.adapter.send(
      this.contractAddress,
      ReputationRegistryABI,
      'appendResponse',
      [agentId, clientAddress, feedbackIndex, responseUri, hash]
    );

    return { txHash: result.txHash };
  }

  /**
   * Get the identity registry address
   * Spec: function getIdentityRegistry() external view returns (address identityRegistry)
   */
  async getIdentityRegistry(): Promise<string> {
    return await this.adapter.call(
      this.contractAddress,
      ReputationRegistryABI,
      'getIdentityRegistry',
      []
    );
  }

  /**
   * Get reputation summary for an agent
   * Spec: function getSummary(uint256 agentId, address[] calldata clientAddresses, bytes32 tag1, bytes32 tag2) returns (uint64 count, uint8 averageScore)
   * Note: agentId is ONLY mandatory parameter, others are OPTIONAL filters
   *
   * @param agentId - The agent ID (MANDATORY)
   * @param clientAddresses - OPTIONAL filter by specific clients
   * @param tag1 - OPTIONAL filter by tag1
   * @param tag2 - OPTIONAL filter by tag2
   */
  async getSummary(
    agentId: bigint,
    clientAddresses?: string[],
    tag1?: string,
    tag2?: string
  ): Promise<{ count: bigint; averageScore: number }> {
    const clients = clientAddresses || [];
    const t1 = tag1 ? ethers.id(tag1).slice(0, 66) : ethers.ZeroHash;
    const t2 = tag2 ? ethers.id(tag2).slice(0, 66) : ethers.ZeroHash;

    const result = await this.adapter.call(
      this.contractAddress,
      ReputationRegistryABI,
      'getSummary',
      [agentId, clients, t1, t2]
    );

    return {
      count: BigInt(result.count || result[0]),
      averageScore: Number(result.averageScore || result[1]),
    };
  }

  /**
   * Read a specific feedback entry
   * Spec: function readFeedback(uint256 agentId, address clientAddress, uint64 index) returns (uint8 score, bytes32 tag1, bytes32 tag2, bool isRevoked)
   *
   * @param agentId - The agent ID
   * @param clientAddress - Client who gave feedback
   * @param index - Feedback index
   */
  async readFeedback(
    agentId: bigint,
    clientAddress: string,
    index: bigint
  ): Promise<{ score: number; tag1: string; tag2: string; isRevoked: boolean }> {
    const result = await this.adapter.call(
      this.contractAddress,
      ReputationRegistryABI,
      'readFeedback',
      [agentId, clientAddress, index]
    );

    return {
      score: Number(result.score || result[0]),
      tag1: result.tag1 || result[1],
      tag2: result.tag2 || result[2],
      isRevoked: Boolean(result.isRevoked || result[3]),
    };
  }

  /**
   * Read all feedback for an agent with optional filters
   * Spec: function readAllFeedback(uint256 agentId, address[] calldata clientAddresses, bytes32 tag1, bytes32 tag2, bool includeRevoked) returns arrays
   * Note: agentId is ONLY mandatory parameter
   *
   * @param agentId - The agent ID (MANDATORY)
   * @param clientAddresses - OPTIONAL filter by clients
   * @param tag1 - OPTIONAL filter by tag1
   * @param tag2 - OPTIONAL filter by tag2
   * @param includeRevoked - OPTIONAL include revoked feedback
   */
  async readAllFeedback(
    agentId: bigint,
    clientAddresses?: string[],
    tag1?: string,
    tag2?: string,
    includeRevoked?: boolean
  ): Promise<{
    clientAddresses: string[];
    scores: number[];
    tag1s: string[];
    tag2s: string[];
    revokedStatuses: boolean[];
  }> {
    const clients = clientAddresses || [];
    const t1 = tag1 ? ethers.id(tag1).slice(0, 66) : ethers.ZeroHash;
    const t2 = tag2 ? ethers.id(tag2).slice(0, 66) : ethers.ZeroHash;
    const includeRev = includeRevoked || false;

    const result = await this.adapter.call(
      this.contractAddress,
      ReputationRegistryABI,
      'readAllFeedback',
      [agentId, clients, t1, t2, includeRev]
    );

    return {
      clientAddresses: result.clientAddresses || result[0],
      scores: (result.scores || result[1]).map(Number),
      tag1s: result.tag1s || result[2],
      tag2s: result.tag2s || result[3],
      revokedStatuses: (result.revokedStatuses || result[4]).map(Boolean),
    };
  }

  /**
   * Get response count for a feedback entry
   * Spec: function getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex, address[] responders) returns (uint64)
   * Note: agentId is ONLY mandatory parameter
   */
  async getResponseCount(
    agentId: bigint,
    clientAddress?: string,
    feedbackIndex?: bigint,
    responders?: string[]
  ): Promise<bigint> {
    const client = clientAddress || ethers.ZeroAddress;
    const index = feedbackIndex || BigInt(0);
    const resp = responders || [];

    const result = await this.adapter.call(
      this.contractAddress,
      ReputationRegistryABI,
      'getResponseCount',
      [agentId, client, index, resp]
    );

    return BigInt(result);
  }

  /**
   * Get all clients who have given feedback to an agent
   * Spec: function getClients(uint256 agentId) returns (address[] memory)
   */
  async getClients(agentId: bigint): Promise<string[]> {
    return await this.adapter.call(
      this.contractAddress,
      ReputationRegistryABI,
      'getClients',
      [agentId]
    );
  }

  /**
   * Get the last feedback index from a client for an agent
   * Spec: function getLastIndex(uint256 agentId, address clientAddress) returns (uint64)
   *
   * @param agentId - The agent ID
   * @param clientAddress - Client address
   * @returns Last feedback index (0 if no feedback yet)
   */
  async getLastIndex(agentId: bigint, clientAddress: string): Promise<bigint> {
    const result = await this.adapter.call(
      this.contractAddress,
      ReputationRegistryABI,
      'getLastIndex',
      [agentId, clientAddress]
    );

    return BigInt(result);
  }
}