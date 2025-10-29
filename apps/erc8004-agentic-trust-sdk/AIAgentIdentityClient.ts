/**
 * Agentic Trust SDK - Identity Client
 * Extends the base ERC-8004 IdentityClient with AA-centric helpers.
 */
import { createPublicClient, http, namehash, labelhash, encodeFunctionData, hexToString, type Chain, type PublicClient } from 'viem';
import { ethers } from 'ethers';
import { sepolia, baseSepolia, optimismSepolia } from 'viem/chains';


import { IdentityClient as BaseIdentityClient } from '@erc8004/sdk';
import IdentityRegistryABI from './abis/IdentityRegistry.json';
import type { MetadataEntry } from '@erc8004/sdk';

export class AIAgentIdentityClient extends BaseIdentityClient {
  private chain: Chain;
  private identityRegistryAddress: `0x${string}`;
  private publicClient: PublicClient | null = null;

  constructor(
    chainId: number,
    rpcUrl: string,
    identityRegistryAddress: `0x${string}`
  ) {
    // this sdk does not make on-chain modifications.  Just reads stuff and prepares calls with correct encodings.
    super(null as any, identityRegistryAddress);

    // Configure the correct chain based on chainId
    this.chain = this.getChainById(chainId);
    // @ts-ignore - viem version compatibility issue
    this.publicClient = createPublicClient({ chain: this.chain, transport: http(rpcUrl) });
    this.identityRegistryAddress = identityRegistryAddress;
  }

  private getChainById(chainId: number): Chain {
    switch (chainId) {
      case 11155111: // ETH Sepolia
        return sepolia;
      case 84532: // Base Sepolia
        return baseSepolia;
      case 11155420: // Optimism Sepolia
        return optimismSepolia;
      default:
        console.warn(`Unknown chainId ${chainId}, defaulting to ETH Sepolia`);
        return sepolia;
    }
  }


  async getMetadata(agentId: bigint, key: string): Promise<string> {
    // @ts-ignore - viem version compatibility issue
    const bytes = await this.publicClient?.readContract({
      address: this.identityRegistryAddress,
      abi: IdentityRegistryABI,
      functionName: 'getMetadata',
      args: [agentId, key]
    });
    return hexToString(bytes as `0x${string}`);
  }


  encodeCall(
    abi: any[],
    functionName: string,
    args: any[]
  ): string {
    const iface = new ethers.Interface(abi);
    return iface.encodeFunctionData(functionName, args);
  }


  /**
   * Encode register calldata without sending (for bundler/AA - like EAS SDK pattern)
   * This override exists in the Agentic Trust SDK to keep AA helpers here.
   */
  async encodeRegisterWithMetadata(
    tokenURI: string,
    metadata: MetadataEntry[] = []
  ): Promise<string> {
    const metadataFormatted = metadata.map(m => ({
      key: m.key,
      value: (this as any).stringToBytes(m.value) as Uint8Array,
    }));
    return this.encodeCall(
      IdentityRegistryABI as any,
      'register(string,(string,bytes)[])',
      [tokenURI, metadataFormatted]
    );
  }

  async encodeRegister(name: string, agentAccount: `0x${string}`, tokenURI: string): Promise<string> {

    console.info("name: ", name);
    console.info("agentAccount: ", agentAccount);

    // check that ENS name is associated with this agent account
    /*
    const foundAccount = await this.getAgentAccountByName(name);
    if (foundAccount && agentAccount.endsWith(foundAccount) && foundAccount !== '0x0000000000000000000000000000000000000000') {
      console.info("Agent name exists for this account and it matches the agent account");

      // check that Agent Identity does not already exist for this ENS name
      const foundAgentIdentity = await ensnameClient.getAgentIdentityByName1(name);
      console.info("foundAgentIdentity: ", foundAgentIdentity);
      if (foundAgentIdentity.agentId && foundAgentIdentity.agentId > 0n) {
        throw new Error('Agent identity already exists for this ENS name');
      }

      return await this.encodeRegisterWithMetadata(tokenURI, [{ key: 'agentName', value: name }, { key: 'agentAccount', value: agentAccount }]);
    }
    throw new Error('Agent name does not match that of agent account.  You must register an ENS name for this agent account first.');

    */


    return await this.encodeRegisterWithMetadata(tokenURI, [{ key: 'agentName', value: name }, { key: 'agentAccount', value: agentAccount }]);

  }

  async prepareRegisterCalls(name: string, agentAccount: `0x${string}`, tokenURI: string): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {
    const data = await this.encodeRegisterWithMetadata(tokenURI, [{ key: 'agentName', value: name }, { key: 'agentAccount', value: agentAccount }]);
    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];
    calls.push({ 
        to: this.identityRegistryAddress, 
        data: data as `0x${string}`
    });
    return { calls };
  }



  async encodeSetRegistrationUri(agentId: bigint, uri: string): Promise<`0x${string}`>  {
    const data = encodeFunctionData({
        abi: IdentityRegistryABI as any,
        functionName: 'setAgentUri',
        args: [agentId, uri]
    });
    return data as `0x${string}`;
  }

  async prepareSetRegistrationUriCalls(
    agentId: bigint, 
    uri: string
  ): Promise<{ calls: { to: `0x${string}`; data: `0x${string}` }[] }> {

    const calls: { to: `0x${string}`; data: `0x${string}` }[] = [];

    const data = await this.encodeSetRegistrationUri(agentId, uri);
    calls.push({ 
      to: this.identityRegistryAddress, 
      data: data as `0x${string}`
    });

    return { calls };

  } 


  async isValidAgentAccount(agentAccount: `0x${string}`): Promise<boolean | null> {
    if (this.publicClient) {
    const code = await this.publicClient.getBytecode({ address: agentAccount as `0x${string}` });
      return code ? true : false;
    } 
    return false;
  }

    /**
   * Extract agentId from a user operation/transaction receipt
   * Public in this SDK to support AA flows explicitly.
   */
   extractAgentIdFromReceiptPublic(receipt: any): bigint {
    // Look for parsed events first
    if (receipt?.events) {
        const registeredEvent = receipt.events.find((e: any) => e.name === 'Registered');
        if (registeredEvent?.args) {
        const val = registeredEvent.args.agentId ?? registeredEvent.args[0];
        if (val !== undefined) return BigInt(val);
        }

        const transferEvent = receipt.events.find(
        (e: any) => e.name === 'Transfer' && (e.args.from === '0x0000000000000000000000000000000000000000' || e.args.from === 0 || e.args.from === 0n)
        );
        if (transferEvent?.args) {
        const val = transferEvent.args.tokenId ?? transferEvent.args[2];
        if (val !== undefined) return BigInt(val);
        }
    }

    // Fallback: raw logs array
    if (receipt?.logs && Array.isArray(receipt.logs)) {
        for (const log of receipt.logs) {
        // Transfer(address,address,uint256)
        if (log.topics && log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
            const from = log.topics[1];
            if (from === '0x0000000000000000000000000000000000000000000000000000000000000000') {
            const tokenId = BigInt(log.topics[3] || log.data);
            return tokenId;
            }
        }
        }
    }

    throw new Error('Could not extract agentId from transaction receipt - Registered or Transfer event not found');
    }

  async getAgentEoaByAgentAccount(agentAccount: `0x${string}`): Promise<string | null> {
    if (this.publicClient) {
        // @ts-ignore - viem version compatibility issue
    const eoa = await this.publicClient.readContract({
        address: agentAccount as `0x${string}`,
        abi: [{ name: 'owner', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
        functionName: 'owner',
      });
      return eoa as string;
    } 
    return null;
  }

  /**
   * Get agentName from on-chain metadata (string value)
   */
  async getAgentName(agentId: bigint): Promise<string | null> {

    try {
      const name = await (this as any).getMetadata(agentId, 'agentName');
      if (typeof name === 'string') {
        const trimmed = name.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      return name ? String(name) : null;
    } catch (error: any) {
      console.info("++++++++++++++++++++++++ getAgentName: error", error);
      return null;
    }
  }



  /**
   * Get agentAccount address from on-chain metadata.
   * Supports CAIP-10 format like "eip155:11155111:0x..." or raw 0x address.
   */
  async getAgentAccount(agentId: bigint): Promise<`0x${string}` | null> {
    try {
      const value = await (this as any).getMetadata(agentId, 'agentAccount');
      if (!value) return null;
      if (typeof value === 'string') {
        const v = value.trim();
        if (v.startsWith('eip155:')) {
          const parts = v.split(':');
          const addr = parts[2];
          if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr as `0x${string}`;
        }
        if (/^0x[a-fA-F0-9]{40}$/.test(v)) return v as `0x${string}`;
      }
      return null;
    } catch {
      return null;
    }
  }


  /**
   * Keep compatibility: delegate to receipt extractor.
   */
  extractAgentIdFromLogs(receipt: any): bigint {
    return this.extractAgentIdFromReceiptPublic(receipt);
  }

}

