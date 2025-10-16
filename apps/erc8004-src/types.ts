/**
 * ERC-8004 SDK Types
 * All types strictly follow the ERC-8004 specification
 */

/**
 * Metadata entry for agent registration
 * Used when registering an agent with on-chain metadata
 */
export interface MetadataEntry {
  key: string;
  value: string; // Will be converted to bytes in the contract
}

/**
 * Agent registration file structure
 * Fields marked OPTIONAL follow "MAY" requirements in the spec
 */
export interface AgentRegistrationFile {
  type: string; // MUST be "https://eips.ethereum.org/EIPS/eip-8004#registration-v1"
  name: string; // MUST
  description: string; // MUST
  image: string; // MUST
  endpoints?: Array<{
    name: string;
    endpoint: string;
    version?: string; // SHOULD but not MUST
    capabilities?: any; // OPTIONAL, as per MCP spec
  }>; // OPTIONAL
  registrations?: Array<{
    agentId: number;
    agentRegistry: string;
  }>; // SHOULD have at least one
  supportedTrust?: Array<'reputation' | 'crypto-economic' | 'tee-attestation' | string>; // OPTIONAL
}

/**
 * Feedback authorization structure
 * Tuple: (agentId, clientAddress, indexLimit, expiry, chainId, identityRegistry, signerAddress)
 */
export interface FeedbackAuth {
  agentId: bigint;
  clientAddress: string;
  indexLimit: bigint;
  expiry: bigint;
  chainId: bigint;
  identityRegistry: string;
  signerAddress: string;
}

/**
 * Feedback structure as stored on-chain
 */
export interface Feedback {
  score: number; // 0-100, MUST
  tag1?: string; // OPTIONAL (bytes32)
  tag2?: string; // OPTIONAL (bytes32)
  isRevoked: boolean;
}

/**
 * Off-chain feedback file structure
 * Fields beyond the MUST fields are all OPTIONAL per spec
 */
export interface FeedbackFile {
  // MUST fields
  agentRegistry: string;
  agentId: number;
  clientAddress: string;
  createdAt: string; // ISO 8601
  feedbackAuth: string;
  score: number;

  // MAY fields (all optional)
  tag1?: string;
  tag2?: string;
  skill?: string;
  context?: string;
  task?: string;
  capability?: 'prompts' | 'resources' | 'tools' | 'completions';
  name?: string;
  proof_of_payment?: {
    fromAddress: string;
    toAddress: string;
    chainId: string;
    txHash: string;
  };
  [key: string]: any; // Allow arbitrary additional fields
}

/**
 * Summary statistics for reputation or validation
 */
export interface Summary {
  count: bigint;
  averageScore: number;
}

/**
 * Validation status
 * Note: responseHash is optional for backward compatibility with older contract versions
 */
export interface ValidationStatus {
  validatorAddress: string;
  agentId: bigint;
  response: number; // 0-100
  responseHash?: string; // bytes32 (optional for backward compatibility)
  tag: string; // bytes32
  lastUpdate: bigint;
}

/**
 * SDK Configuration
 * Accepts any Ethereum provider compatible with ethers.js v6
 */
export interface ERC8004Config {
  identityRegistryAddress: string;
  reputationRegistryAddress: string;
  validationRegistryAddress: string;
  provider: any; // ethers.Provider or any EIP-1193 compatible provider (MetaMask, WalletConnect, etc.)
  signer?: any; // ethers.Signer (optional, needed for write operations)
}