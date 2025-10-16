/**
 * Viem adapter implementation
 * Viem is a modern TypeScript-first Ethereum library
 */

import {
  PublicClient,
  WalletClient,
  Account,
  Address,
  Hash,
  TransactionReceipt,
  decodeEventLog,
} from 'viem';
import { BlockchainAdapter, ContractCallResult } from './types';

export class ViemAdapter implements BlockchainAdapter {
  private publicClient: PublicClient;
  private walletClient?: WalletClient;
  private account?: Account | Address;

  constructor(
    publicClient: PublicClient,
    walletClient?: WalletClient,
    account?: Account | Address
  ) {
    this.publicClient = publicClient;
    this.walletClient = walletClient;
    this.account = account;
  }

  async call(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[]
  ): Promise<any> {
    // Strip function signature if present (ethers format compatibility)
    // Viem auto-matches based on args, ethers uses "functionName(types)"
    const cleanFunctionName = functionName.includes('(')
      ? functionName.substring(0, functionName.indexOf('('))
      : functionName;

    // ABI is already in proper JSON format, use directly
    const result = await this.publicClient.readContract({
      address: contractAddress as Address,
      abi: abi as any,
      functionName: cleanFunctionName,
      args,
    });
    return result;
  }

  async send(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[]
  ): Promise<ContractCallResult> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet client and account required for write operations');
    }

    // Strip function signature if present (ethers format compatibility)
    // Viem auto-matches based on args, ethers uses "functionName(types)"
    const cleanFunctionName = functionName.includes('(')
      ? functionName.substring(0, functionName.indexOf('('))
      : functionName;

    // ABI is already in proper JSON format, use directly
    // Simulate the transaction first
    const { request } = await this.publicClient.simulateContract({
      address: contractAddress as Address,
      abi: abi as any,
      functionName: cleanFunctionName,
      args,
      account: this.account,
    });

    // Write the transaction
    const hash = await this.walletClient.writeContract(request);

    // Wait for transaction receipt
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
    });

    // Parse events from the receipt
    const events: any[] = [];

    for (const log of receipt.logs) {
      try {
        const decoded: any = decodeEventLog({
          abi: abi as any,
          data: log.data,
          topics: log.topics,
        });
        events.push({
          name: decoded.eventName,
          args: decoded.args,
        });
      } catch {
        // Skip logs that can't be decoded with this ABI
      }
    }

    return {
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      receipt,
      events,
    };
  }

  async getAddress(): Promise<string | null> {
    if (!this.account) {
      return null;
    }

    // Handle both Account objects and raw addresses
    if (typeof this.account === 'string') {
      return this.account;
    }

    return this.account.address;
  }

  async getChainId(): Promise<number> {
    const chainId = await this.publicClient.getChainId();
    return chainId;
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet client and account required for signing');
    }

    const signature = await this.walletClient.signMessage({
      account: this.account,
      message: typeof message === 'string' ? message : { raw: message },
    });

    return signature;
  }

  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    if (!this.walletClient || !this.account) {
      throw new Error('Wallet client and account required for signing');
    }

    const signature = await this.walletClient.signTypedData({
      account: this.account,
      domain,
      types,
      primaryType: Object.keys(types)[0], // Viem requires primaryType
      message: value,
    });

    return signature;
  }
}