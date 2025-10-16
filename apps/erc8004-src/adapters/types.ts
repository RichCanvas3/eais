/**
 * Adapter interface for blockchain interactions
 * Allows SDK to work with any blockchain library (ethers, viem, etc.)
 */

export interface ContractCallResult {
  txHash: string;
  blockNumber?: bigint;
  [key: string]: any;
}

/**
 * Generic blockchain adapter interface
 * Implementations provide library-specific functionality
 */
export interface BlockchainAdapter {
  /**
   * Call a read-only contract function
   */
  call(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[]
  ): Promise<any>;

  /**
   * Send a transaction to a contract function
   */
  send(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[]
  ): Promise<ContractCallResult>;

  /**
   * Get the current signer/wallet address
   * Returns null if no signer configured (read-only mode)
   */
  getAddress(): Promise<string | null>;

  /**
   * Get the chain ID
   */
  getChainId(): Promise<number>;

  /**
   * Sign a message (EIP-191 or ERC-1271)
   */
  signMessage(message: string | Uint8Array): Promise<string>;

  /**
   * Sign typed data (EIP-712)
   */
  signTypedData(domain: any, types: any, value: any): Promise<string>;
}