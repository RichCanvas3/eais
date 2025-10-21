/**
 * L2 ENS Client for Base Sepolia
 * Extends AIAgentENSClient with namespace.ninja integration for L2 subname operations
 */
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
   * Create a subname using namespace.ninja
   */
  async createSubname(params: {
    fullSubname: string;
    parentName: string;
    label: string;
    addressToUse: string;
    description?: string;
    chainId: number;
    isBaseSepolia: boolean;
  }): Promise<{
    to: string;
    data: string;
    value: bigint;
  }> {
    if (!this.namespaceClient) {
      throw new Error('Namespace.ninja client not initialized');
    }

    const { fullSubname, parentName, label, addressToUse, description, chainId, isBaseSepolia } = params;
    const chainName = isBaseSepolia ? 'base-sepolia' : 'eth-sepolia';

    // Prepare mint transaction parameters using namespace.ninja SDK
    const mintRequest = {
      parentName: parentName, // e.g., "theorg.eth"
      label: label, // e.g., "atl-test-1"
      owner: addressToUse,
      minterAddress: addressToUse,
      records: {
        texts: [
          { key: 'name', value: label },
          { key: 'description', value: description || `Agent: ${label}` },
          { key: 'agent-identity', value: `eip155:${chainId}:${addressToUse}` },
          { key: 'chain', value: chainName },
          { key: 'agent-account', value: addressToUse },
        ],
        addresses: [
          { 
            chain: 60, // Ethereum coin type
            value: addressToUse 
          },
        ],
      }
    };

    const mintParams = await this.namespaceClient.getMintTransactionParameters(mintRequest);
    
    return {
      to: mintParams.contractAddress,
      data: mintParams.data,
      value: mintParams.value || 0n
    };
  }

  /**
   * Get the namespace client instance
   */
  getNamespaceClient(): any {
    return this.namespaceClient;
  }
}
