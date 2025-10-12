// Base58 alphabet (Bitcoin style)
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Decode a base58 string to bytes
 */
function base58Decode(input: string): Uint8Array {
  const bytes: number[] = [];

  for (let i = 0; i < input.length; i++) {
    let carry = BASE58_ALPHABET.indexOf(input[i]);
    if (carry < 0) {
      throw new Error(`Invalid base58 character: ${input[i]}`);
    }

    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  // Handle leading zeros
  for (let i = 0; i < input.length && input[i] === '1'; i++) {
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

/**
 * Convert any IPFS CID (v0 or v1) to bytes32 hex string
 * Works for Qm... (CIDv0) formats
 *
 * @param cidStr - The IPFS CID string (v0 like "QmXXX...")
 * @returns Ethereum bytes32 hex string (0x-prefixed)
 * @throws Error if the CID is invalid or digest length is not 32 bytes
 *
 * @example
 * ```typescript
 * const cidv0 = 'QmR7GSQM93Cx5eAg6a6yRzNde1FQv7uL6X1o4k7zrJa3LX';
 * const bytes32 = cidToBytes32(cidv0);
 * // Returns: '0x...' (32 bytes hex)
 * ```
 */
export function cidToBytes32(cidStr: string): string {
  // CIDv0 always starts with 'Qm'
  if (!cidStr.startsWith('Qm')) {
    throw new Error('Only CIDv0 (starting with Qm) is currently supported');
  }

  // Decode base58
  const bytes = base58Decode(cidStr);

  // CIDv0 format: [0x12, 0x20, ...32 bytes of hash...]
  // 0x12 = sha256 hash function code
  // 0x20 = 32 bytes length
  if (bytes.length !== 34) {
    throw new Error(`Invalid CID length: ${bytes.length}, expected 34`);
  }

  if (bytes[0] !== 0x12 || bytes[1] !== 0x20) {
    throw new Error('Invalid CID format: expected SHA-256 hash');
  }

  // Extract the 32-byte hash (skip the 2-byte header)
  const hash = bytes.slice(2);

  // Convert to hex string
  return '0x' + Array.from(hash)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Extract CID from IPFS URI and convert to bytes32
 * Handles both raw CIDs and ipfs:// URIs
 *
 * @param uri - IPFS URI (e.g., "ipfs://QmXXX..." or just "QmXXX...")
 * @returns Ethereum bytes32 hex string (0x-prefixed)
 *
 * @example
 * ```typescript
 * const uri = 'ipfs://QmR7GSQM93Cx5eAg6a6yRzNde1FQv7uL6X1o4k7zrJa3LX';
 * const bytes32 = ipfsUriToBytes32(uri);
 * ```
 */
export function ipfsUriToBytes32(uri: string): string {
  // Remove ipfs:// prefix if present
  const cid = uri.replace(/^ipfs:\/\//, '');
  return cidToBytes32(cid);
}
