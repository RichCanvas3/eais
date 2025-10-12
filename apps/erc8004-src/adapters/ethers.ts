/**
 * Ethers.js v6 adapter implementation
 */

import { Contract, ethers } from 'ethers';
import { BlockchainAdapter, ContractCallResult } from './types';

export class EthersAdapter implements BlockchainAdapter {
  private provider: ethers.Provider;
  private signer?: ethers.Signer;

  constructor(provider: ethers.Provider, signer?: ethers.Signer) {
    this.provider = provider;
    this.signer = signer;
  }

  async call(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[]
  ): Promise<any> {
    const contract = new Contract(contractAddress, abi, this.provider);
    return await contract[functionName](...args);
  }

  async send(
    contractAddress: string,
    abi: any[],
    functionName: string,
    args: any[]
  ): Promise<ContractCallResult> {
    if (!this.signer) {
      throw new Error('Signer required for write operations');
    }

    const contract = new Contract(contractAddress, abi, this.signer);
    const tx = await contract[functionName](...args);
    const receipt = await tx.wait();

    // Parse events from the receipt
    const events: any[] = [];
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed) {
          events.push({
            name: parsed.name,
            args: parsed.args,
          });
        }
      } catch {
        // Skip logs that don't match this contract's ABI
      }
    }

    return {
      txHash: receipt.hash,
      blockNumber: BigInt(receipt.blockNumber),
      receipt,
      events,
    };
  }

  async getAddress(): Promise<string | null> {
    if (!this.signer) {
      return null;
    }
    return await this.signer.getAddress();
  }

  async getChainId(): Promise<number> {
    const network = await this.provider.getNetwork();
    return Number(network.chainId);
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for signing');
    }
    return await this.signer.signMessage(message);
  }

  async signTypedData(domain: any, types: any, value: any): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer required for signing');
    }

    // Check if signer supports signTypedData (Wallet does, but not all signers)
    if ('signTypedData' in this.signer && typeof (this.signer as any).signTypedData === 'function') {
      return await (this.signer as any).signTypedData(domain, types, value);
    }

    throw new Error('Signer does not support EIP-712 typed data signing');
  }
}
