/**
 * ERC-8004 Trustless Agents SDK
 *
 * A TypeScript SDK for interacting with ERC-8004 compliant implementations.
 * Makes zero assumptions beyond what the spec says.
 * All "MAY" fields are optional, not mandatory.
 *
 * Uses adapter pattern to support any blockchain library.
 */

export { ERC8004Client } from './ERC8004Client';
export { IdentityClient } from './IdentityClient';
export { ReputationClient } from './ReputationClient';
export { ValidationClient } from './ValidationClient';
export * from './adapters/types';
export * from './adapters/ethers';
// export * from './adapters/viem'; // Temporarily disabled due to viem compatibility issues
export * from './types';
// IPFS utilities temporarily disabled due to TypeScript compatibility issues
// export {
//   cidToBytes32,
//   ipfsUriToBytes32,
//   IPFSClient,
//   createIPFSClient,
//   type IPFSClientConfig,
//   type IPFSUploadResult
// } from './utils/ipfs';