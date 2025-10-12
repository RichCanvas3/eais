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
export * from './adapters';
export * from './types';
export { cidToBytes32, ipfsUriToBytes32 } from './utils/ipfs';
