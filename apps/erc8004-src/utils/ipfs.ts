/**
 * IPFS Client Configuration
 */
export interface IPFSClientConfig {
  /** Service provider: 'pinata', 'nftstorage', 'web3storage', or 'ipfs' (local node) */
  provider: 'pinata' | 'nftstorage' | 'web3storage' | 'ipfs';
  /** API key/token for the service */
  apiKey?: string;
  /** API secret (required for Pinata) */
  apiSecret?: string;
  /** Custom IPFS gateway URL (defaults to public gateways) */
  gatewayUrl?: string;
  /** Custom IPFS node URL (for local IPFS node) */
  nodeUrl?: string;
}

/**
 * IPFS Upload Result
 */
export interface IPFSUploadResult {
  /** The IPFS CID (Content Identifier) */
  cid: string;
  /** Full IPFS URI (ipfs://...) */
  uri: string;
  /** Gateway URL for accessing the content */
  url: string;
  /** File size in bytes */
  size?: number;
}

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

/**
 * IPFS Client for uploading, pinning, and fetching content
 */
export class IPFSClient {
  private config: IPFSClientConfig;

  constructor(config: IPFSClientConfig) {
    this.config = config;
  }

  /**
   * Upload content to IPFS
   * @param content - String, Buffer, or File to upload
   * @param options - Optional metadata like filename
   * @returns Upload result with CID and URLs
   */
  async upload(
    content: string | Buffer | Blob,
    options?: { name?: string; metadata?: Record<string, any> }
  ): Promise<IPFSUploadResult> {
    switch (this.config.provider) {
      case 'pinata':
        return this.uploadToPinata(content, options);
      case 'nftstorage':
        return this.uploadToNFTStorage(content, options);
      case 'web3storage':
        return this.uploadToWeb3Storage(content, options);
      case 'ipfs':
        return this.uploadToLocalIPFS(content, options);
      default:
        throw new Error(`Unsupported IPFS provider: ${this.config.provider}`);
    }
  }

  /**
   * Upload JSON data to IPFS
   * @param data - JavaScript object to stringify and upload
   * @param options - Optional metadata
   * @returns Upload result
   */
  async uploadJSON(
    data: any,
    options?: { name?: string; metadata?: Record<string, any> }
  ): Promise<IPFSUploadResult> {
    const content = JSON.stringify(data, null, 2);
    const name = options?.name || 'data.json';
    return this.upload(content, { ...options, name });
  }

  /**
   * Pin an existing CID (keep it available on the network)
   * @param cid - The CID to pin
   * @param options - Optional metadata
   */
  async pin(cid: string, options?: { name?: string }): Promise<void> {
    switch (this.config.provider) {
      case 'pinata':
        return this.pinOnPinata(cid, options);
      case 'ipfs':
        return this.pinOnLocalIPFS(cid);
      default:
        throw new Error(`Pinning not supported for provider: ${this.config.provider}`);
    }
  }

  /**
   * Fetch content from IPFS
   * @param cidOrUri - CID or ipfs:// URI
   * @returns Content as string
   */
  async fetch(cidOrUri: string): Promise<string> {
    const cid = cidOrUri.replace(/^ipfs:\/\//, '');
    const gatewayUrl = this.config.gatewayUrl || 'https://ipfs.io/ipfs/';
    const url = `${gatewayUrl}${cid}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch from IPFS: ${response.statusText}`);
    }

    return response.text();
  }

  /**
   * Fetch JSON content from IPFS
   * @param cidOrUri - CID or ipfs:// URI
   * @returns Parsed JSON object
   */
  async fetchJSON<T = any>(cidOrUri: string): Promise<T> {
    const content = await this.fetch(cidOrUri);
    return JSON.parse(content);
  }

  /**
   * Get gateway URL for a CID
   * @param cid - The IPFS CID
   * @returns Full gateway URL
   */
  getGatewayUrl(cid: string): string {
    const gateway = this.config.gatewayUrl || 'https://ipfs.io/ipfs/';
    return `${gateway}${cid}`;
  }

  // Private methods for different providers

  private async uploadToPinata(
    content: string | Buffer | Blob,
    options?: { name?: string; metadata?: Record<string, any> }
  ): Promise<IPFSUploadResult> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error('Pinata requires both apiKey and apiSecret');
    }

    const formData = new FormData();

    // Convert content to Blob if needed
    let blob: Blob;
    if (content instanceof Blob) {
      blob = content;
    } else if (Buffer.isBuffer(content)) {
      blob = new Blob([content]);
    } else {
      blob = new Blob([content], { type: 'application/json' });
    }

    formData.append('file', blob, options?.name || 'file');

    if (options?.metadata) {
      formData.append('pinataMetadata', JSON.stringify({
        name: options.name,
        keyvalues: options.metadata,
      }));
    }

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'pinata_api_key': this.config.apiKey,
        'pinata_secret_api_key': this.config.apiSecret,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata upload failed: ${error}`);
    }

    const result = await response.json() as { IpfsHash: string; PinSize: number };
    const cid = result.IpfsHash;

    return {
      cid,
      uri: `ipfs://${cid}`,
      url: this.getGatewayUrl(cid),
      size: result.PinSize,
    };
  }

  private async uploadToNFTStorage(
    content: string | Buffer | Blob,
    options?: { name?: string }
  ): Promise<IPFSUploadResult> {
    if (!this.config.apiKey) {
      throw new Error('NFT.Storage requires an API key');
    }

    // Convert content to Blob if needed
    let blob: Blob;
    if (content instanceof Blob) {
      blob = content;
    } else if (Buffer.isBuffer(content)) {
      blob = new Blob([content]);
    } else {
      blob = new Blob([content], { type: 'application/json' });
    }

    const response = await fetch('https://api.nft.storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: blob,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NFT.Storage upload failed: ${error}`);
    }

    const result = await response.json() as { value: { cid: string } };
    const cid = result.value.cid;

    return {
      cid,
      uri: `ipfs://${cid}`,
      url: this.getGatewayUrl(cid),
    };
  }

  private async uploadToWeb3Storage(
    content: string | Buffer | Blob,
    options?: { name?: string }
  ): Promise<IPFSUploadResult> {
    if (!this.config.apiKey) {
      throw new Error('Web3.Storage requires an API key');
    }

    // Web3.Storage expects files in a FormData with specific structure
    const formData = new FormData();

    let blob: Blob;
    if (content instanceof Blob) {
      blob = content;
    } else if (Buffer.isBuffer(content)) {
      blob = new Blob([content]);
    } else {
      blob = new Blob([content], { type: 'application/json' });
    }

    formData.append('file', blob, options?.name || 'file');

    const response = await fetch('https://api.web3.storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Web3.Storage upload failed: ${error}`);
    }

    const result = await response.json() as { cid: string };
    const cid = result.cid;

    return {
      cid,
      uri: `ipfs://${cid}`,
      url: this.getGatewayUrl(cid),
    };
  }

  private async uploadToLocalIPFS(
    content: string | Buffer | Blob,
    options?: { name?: string }
  ): Promise<IPFSUploadResult> {
    const nodeUrl = this.config.nodeUrl || 'http://127.0.0.1:5001';

    const formData = new FormData();

    let blob: Blob;
    if (content instanceof Blob) {
      blob = content;
    } else if (Buffer.isBuffer(content)) {
      blob = new Blob([content]);
    } else {
      blob = new Blob([content], { type: 'application/json' });
    }

    formData.append('file', blob, options?.name || 'file');

    const response = await fetch(`${nodeUrl}/api/v0/add`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Local IPFS upload failed: ${error}`);
    }

    const result = await response.json() as { Hash: string; Size: number };
    const cid = result.Hash;

    return {
      cid,
      uri: `ipfs://${cid}`,
      url: this.getGatewayUrl(cid),
      size: result.Size,
    };
  }

  private async pinOnPinata(cid: string, options?: { name?: string }): Promise<void> {
    if (!this.config.apiKey || !this.config.apiSecret) {
      throw new Error('Pinata requires both apiKey and apiSecret');
    }

    const response = await fetch('https://api.pinata.cloud/pinning/pinByHash', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'pinata_api_key': this.config.apiKey,
        'pinata_secret_api_key': this.config.apiSecret,
      },
      body: JSON.stringify({
        hashToPin: cid,
        pinataMetadata: options?.name ? { name: options.name } : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Pinata pin failed: ${error}`);
    }
  }

  private async pinOnLocalIPFS(cid: string): Promise<void> {
    const nodeUrl = this.config.nodeUrl || 'http://127.0.0.1:5001';

    const response = await fetch(`${nodeUrl}/api/v0/pin/add?arg=${cid}`, {
      method: 'POST',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Local IPFS pin failed: ${error}`);
    }
  }
}

/**
 * Create an IPFS client instance
 * @param config - IPFS client configuration
 * @returns Configured IPFS client
 */
export function createIPFSClient(config: IPFSClientConfig): IPFSClient {
  return new IPFSClient(config);
}