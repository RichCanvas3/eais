/**
 * Agentic Trust SDK - Identity Client
 * Extends the base ERC-8004 IdentityClient with AA-centric helpers.
 */
import { createPublicClient, http, namehash, labelhash, encodeFunctionData, hexToString, type Chain, type PublicClient } from 'viem';
import { ethers } from 'ethers';
import { sepolia } from 'viem/chains';



import { ReputationClient as BaseReputationClient } from '@erc8004/sdk';
import ReputationRegistryABI from './abis/ReputationRegistry.json';
import type { MetadataEntry } from '@erc8004/sdk';

// Define GiveFeedbackParams locally since it's not exported from the base SDK
export interface GiveFeedbackParams {
  agent: string;
  score: number;
  feedback: string;
  metadata?: MetadataEntry[];
  tag1?: string;
  tag2?: string;
  feedbackHash?: string;
  feedbackUri?: string;
  agentId?: string;
  feedbackAuth?: string;
}

export class AIAgentReputationClient extends BaseReputationClient {
  private chain: Chain;
  private orgAdapter: any;
  private agentAdapter: any;
  private clientAdapter: any;
  private ensRegistryAddress: `0x${string}`;

  private reputationAddress: `0x${string}`;

  private publicClient: PublicClient | null = null;

  constructor(
    agentAdapter: any,
    clientAdapter: any,
    registrationRegistryAddress: `0x${string}`,
    identityRegistryAddress: `0x${string}`,
    ensRegistryAddress: `0x${string}`
  ) {
    super(agentAdapter, registrationRegistryAddress, identityRegistryAddress);

    this.chain = sepolia;

    this.publicClient = agentAdapter.publicClient;

    this.clientAdapter = clientAdapter;
    this.agentAdapter = agentAdapter;

    this.reputationAddress = registrationRegistryAddress;
    this.ensRegistryAddress = ensRegistryAddress;


  }

  // Expose base-class methods so TypeScript recognizes them on this subclass
  getIdentityRegistry(): Promise<string> {
    return (BaseReputationClient.prototype as any).getIdentityRegistry.call(this);
  }
  getLastIndex(agentId: bigint, clientAddress: string): Promise<bigint> {
    return (BaseReputationClient.prototype as any).getLastIndex.call(this, agentId, clientAddress);
  }
  createFeedbackAuth(
    agentId: bigint,
    clientAddress: string,
    indexLimit: bigint,
    expiry: bigint,
    chainId: bigint,
    signerAddress: string
  ): any {
    return (BaseReputationClient.prototype as any).createFeedbackAuth.call(
      this,
      agentId,
      clientAddress,
      indexLimit,
      expiry,
      chainId,
      signerAddress
    );
  }
  signFeedbackAuth(auth: any): Promise<string> {
    return (BaseReputationClient.prototype as any).signFeedbackAuth.call(this, auth);
  }

  // Factory: resolve identityRegistry from reputation/registration registry before constructing
  static async create(
    agentAdapter: any,
    clientAdapter: any,
    registrationRegistryAddress: `0x${string}`,
    ensRegistryAddress: `0x${string}`
  ): Promise<AIAgentReputationClient> {
    let identityRegistryAddress: `0x${string}`;
    try {
      identityRegistryAddress = await (agentAdapter as any).call(
        registrationRegistryAddress,
        ReputationRegistryABI,
        'getIdentityRegistry',
        []
      );
      if (!identityRegistryAddress || identityRegistryAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Empty identity registry');
      }
    } catch (e) {
      throw new Error(`Failed to resolve identity registry from reputation registry: ${(e as any)?.message || e}`);
    }
    return new AIAgentReputationClient(
      agentAdapter,
      clientAdapter,
      registrationRegistryAddress,
      identityRegistryAddress,
      ensRegistryAddress
    );
  }

  /**
   * Submit feedback for an agent
   * Spec: function giveFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string calldata feedbackUri, bytes32 calldata feedbackHash, bytes memory feedbackAuth)
   *
   * @param params - Feedback parameters (score is MUST, others are OPTIONAL)
   * @returns Transaction result
   */
  async giveClientFeedback(params: GiveFeedbackParams): Promise<{ txHash: string }> {
    // Validate score is 0-100 (MUST per spec)
    if (params.score < 0 || params.score > 100) {
      throw new Error('Score MUST be between 0 and 100');
    }

    // Convert optional string parameters to bytes32 (or empty bytes32 if not provided)
    const tag1 = params.tag1 ? ethers.id(params.tag1).slice(0, 66) : ethers.ZeroHash;
    const tag2 = params.tag2 ? ethers.id(params.tag2).slice(0, 66) : ethers.ZeroHash;
    const feedbackHash = params.feedbackHash || ethers.ZeroHash;
    const feedbackUri = params.feedbackUri || '';

    const result = await this.clientAdapter.send(
      this.reputationAddress,
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
}