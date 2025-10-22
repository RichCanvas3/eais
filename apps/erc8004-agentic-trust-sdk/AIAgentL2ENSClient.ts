/**
 * L2 ENS Client for Base Sepolia
 * Extends AIAgentENSClient with namespace.ninja integration for L2 subname operations
 */
import { createPublicClient, http, custom, encodeFunctionData, keccak256, stringToHex, zeroAddress, createWalletClient, namehash, hexToString, type Address } from 'viem';

import { AIAgentENSClient } from './AIAgentENSClient';
// @ts-ignore - @thenamespace/mint-manager doesn't have type definitions
import { createMintClient } from '@thenamespace/mint-manager';
import { sepolia, baseSepolia } from 'viem/chains';

export class AIAgentL2ENSClient extends AIAgentENSClient {
  private namespaceClient: any = null;

  constructor(
    chain: any,
    rpcUrl: string,
    adapter: any,
    ensRegistryAddress: `0x${string}`,
    ensResolverAddress: `0x${string}`,
    identityRegistryAddress: `0x${string}`,
  ) {
    super(chain, rpcUrl, adapter, ensRegistryAddress, ensResolverAddress, identityRegistryAddress);
    this.initializeNamespaceClient();
  }

  /**
   * Override to ensure L2 client always returns true for isL2()
   */
  isL2(): boolean {
    return true; // This is always an L2 client
  }

  /**
   * Override to ensure L2 client always returns false for isL1()
   */
  isL1(): boolean {
    return false; // This is never an L1 client
  }

  /**
   * Override to ensure L2 client always returns 'L2'
   */
  getChainType(): 'L1' | 'L2' {
    return 'L2';
  }

  private initializeNamespaceClient() {
    try {
      const client = createMintClient({
        isTestnet: true, // Use testnet (sepolia)
        cursomRpcUrls: {
          [sepolia.id]: process.env.NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/demo',
          [baseSepolia.id]: process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || 'https://base-sepolia.g.alchemy.com/v2/demo',
        }
      });
      
      this.namespaceClient = client;
      console.info('Namespace.ninja L2 client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize namespace.ninja L2 client:', error);
    }
  }

  /**
   * Override getAgentAccountByName to use namespace.ninja for L2 availability checking
   */
  async getAgentAccountByName(name: string): Promise<`0x${string}` | null> {
    // First try the parent class method (standard ENS lookup)
    try {
      const result = await super.getAgentAccountByName(name);
      if (result && result !== '0x0000000000000000000000000000000000000000') {
        return result;
      }
    } catch (error) {
      console.log('Standard ENS lookup failed, trying namespace.ninja:', error);
    }

    // If standard lookup fails and we have namespace client, try L2 lookup
    if (this.namespaceClient) {
      try {
        const chainId = (this as any).chain.id;
        const isAvailable = await this.namespaceClient.isL2SubnameAvailable(name, chainId);
        if (!isAvailable) {
          // Subname exists but we can't get the address from namespace.ninja
          // Return a placeholder to indicate it exists
          return '0x0000000000000000000000000000000000000001' as `0x${string}`;
        }
      } catch (error) {
        console.error('Error checking L2 subname availability:', error);
      }
    }

    return null;
  }

  /**
   * Get the namespace client instance
   */
  getNamespaceClient(): any {
    return this.namespaceClient;
  }

  /**
   * Override prepareAddAgentNameToOrgCalls to use namespace.ninja SDK for L2
   */
  async prepareAddAgentNameToOrgCalls(params: {
    orgName: string;            // e.g., 'airbnb.eth'
    agentName: string;          // e.g., 'my-agent'
    agentAddress: `0x${string}`; // AA address for the agent name
    agentUrl?: string | null    // optional URL
  }): Promise<{ calls: { to: `0x${string}`; data: `0x${string}`; value?: bigint }[] }> {

    console.log("AIAgentL2ENSClient.prepareAddAgentNameToOrgCalls");
    console.log("orgName: ", params.orgName);
    console.log("agentName: ", params.agentName);
    console.log("agentAddress: ", params.agentAddress);
    
    const clean = (s: string) => (s || '').trim().toLowerCase();
    const parent = clean(params.orgName) + ".eth";
    const label = clean(params.agentName).replace(/\s+/g, '-');
    const fullSubname = `${label}.${parent}.eth`;
    const agentAddress = params.agentAddress;

    const chainName = 'base-sepolia';

    console.info("parent: ", parent);
    console.info("label: ", label);
    console.info("agentAddress: ", agentAddress);
    console.info("chainName: ", chainName);

    // Prepare mint transaction parameters using namespace.ninja SDK
    const mintRequest = {
      parentName: parent, // e.g., "theorg.eth"
      label: label, // e.g., "atl-test-1"
      owner: agentAddress,
      minterAddress: agentAddress,
      records: {
        texts: [
          { key: 'name', value: label },
          { key: 'description', value: `Agent: ${label}` },
          { key: 'chain', value: chainName },
          { key: 'agent-account', value: agentAddress },
        ],
        addresses: [
          { 
            chain: 60, // Ethereum coin type
            value: agentAddress 
          },
        ],
      }
    };

    console.info("mintRequest: ", mintRequest);
    const mintParams = await this.namespaceClient.getMintTransactionParameters(mintRequest);
    console.info("mintParams: ", mintParams);

    const { to, data, value } = {
      to: mintParams.contractAddress,
      data: encodeFunctionData({
        abi: mintParams.abi,
        functionName: mintParams.functionName,
        args: mintParams.args,
      }),
      value: mintParams.value || 0n
    };
    const rtnCalls: [{ to: `0x${string}`; data: `0x${string}`; value?: bigint }] = [{
      to: to as `0x${string}`,
      data: data as `0x${string}`,
      value: value,
    }]



    
    // Return the mint transaction parameters as calls
    return { calls: rtnCalls };
  }
}
