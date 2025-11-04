/**
 * Shared logic for indexAgent resolver used by both Express (local) and Workers (production)
 */

import { ERC8004Client, EthersAdapter } from '@erc8004/sdk';
import type { JsonRpcProvider } from 'ethers';
import { processAgentDirectly } from './process-agent';

export interface ChainConfig {
  rpcUrl: string;
  registryAddress: string;
  chainId: number;
  chainName: string;
}

export interface IndexAgentConfig {
  db: any;
  chains: ChainConfig[];
  triggerBackfill?: boolean;
  backfillClients?: ERC8004Client[];
}

/**
 * Get block number from provider (compatible with both ethers.JsonRpcProvider and other providers)
 */
async function getBlockNumber(provider: any): Promise<bigint> {
  try {
    // Try standard getBlockNumber first
    if (typeof provider.getBlockNumber === 'function') {
      const block = await provider.getBlockNumber();
      return BigInt(block);
    }
    
    // Try alternative method (for ethers adapters)
    const publicClient = provider?.adapter?.provider;
    if (publicClient) {
      const block = await publicClient?.getBlockNumber?.() || await publicClient?.getBlock?.('latest');
      return block?.number ? BigInt(block.number) : 0n;
    }
    
    return 0n;
  } catch {
    return 0n;
  }
}

/**
 * Create an indexAgent resolver function
 */
export async function createIndexAgentResolver(config: IndexAgentConfig) {
  return async (args: { agentId: string; chainId?: number }) => {
    try {
      const { agentId, chainId } = args;
      const agentIdBigInt = BigInt(agentId);
      const processedChains: string[] = [];
      const processingErrors: string[] = [];
      const backfillErrors: string[] = [];

      // Check if chains are configured
      if (config.chains.length === 0) {
        return {
          success: false,
          message: `No chains configured for indexing. Please set environment variables: ETH_SEPOLIA_RPC_HTTP_URL, ETH_SEPOLIA_IDENTITY_REGISTRY, BASE_SEPOLIA_RPC_HTTP_URL, BASE_SEPOLIA_IDENTITY_REGISTRY, etc.`,
          processedChains: [],
        };
      }

      // Dynamically import ethers if needed (for Workers environment)
      const ethersModule = await import('ethers');
      const { ethers } = ethersModule;
      
      // Initialize ERC8004 clients for chains that match the filter
      const chainsToProcess: Array<{ name: string; provider: any; client: ERC8004Client; chainId: number }> = [];

      for (const chainConfig of config.chains) {
        // Filter by chainId if specified
        if (chainId !== undefined && chainId !== chainConfig.chainId) {
          continue;
        }

        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        const adapter = new EthersAdapter(provider);
        const client = new ERC8004Client({
          adapter,
          addresses: {
            identityRegistry: chainConfig.registryAddress as `0x${string}`,
            reputationRegistry: '0x0000000000000000000000000000000000000000',
            validationRegistry: '0x0000000000000000000000000000000000000000',
            chainId: chainConfig.chainId,
          }
        });

        chainsToProcess.push({
          name: chainConfig.chainName,
          provider,
          client,
          chainId: chainConfig.chainId,
        });
      }

      let otherMessageText = "other stuff: " + JSON.stringify(chainsToProcess) + " ";

      // Process each chain
      for (const { name, provider, client, chainId: cId } of chainsToProcess) {

        otherMessageText += "chain: " + name + " ";
        try {
          // Check if agent exists by trying to get owner
          const owner = await client.identity.getOwner(agentIdBigInt);
          console.log("............owner: ", owner, "agentIdBigInt: ", agentIdBigInt);
          otherMessageText += "agent: " + agentIdBigInt + " on chain: " + name + " owner: " + owner + " ";
          const tokenURI = await client.identity.getTokenURI(agentIdBigInt).catch(() => null);
          
          // Get current block number
          const blockNumber = await getBlockNumber(provider);
          
          if (owner && owner !== '0x0000000000000000000000000000000000000000') {
            // Agent exists, process it
            await processAgentDirectly(owner.toLowerCase(), agentIdBigInt, blockNumber, tokenURI, cId, config.db);
            processedChains.push(name);
            console.log(`✅ Successfully indexed agent ${agentId} on ${name}`);
          } else {
            // Agent exists but has zero address (burned/uninitialized)
            console.log(`⚠️ Agent ${agentId} exists on ${name} but has zero owner (burned/uninitialized)`);
          }
        } catch (error: any) {
          otherMessageText += "error: " + error + " ";
          // Check if this is a "not found" error (ERC721 token doesn't exist) vs other errors
          const errorMessage = error?.message || String(error);
          const isNotFoundError = errorMessage.includes('ERC721NonexistentToken') ||
                                 errorMessage.includes('nonexistent') ||
                                 errorMessage.includes('not found') ||
                                 errorMessage.includes('Token does not exist') ||
                                 error?.code === 'CALL_EXCEPTION';
          
          if (isNotFoundError) {
            console.log(`⚠️ Agent ${agentId} not found on ${name}`);
          } else {
            // Other error (RPC, processing, etc.) - log but don't treat as "not found"
            const fullError = error?.stack ? `${errorMessage}\n${error.stack}` : errorMessage;
            processingErrors.push(`${name}: ${fullError}`);
            console.error(`❌ Error processing agent ${agentId} on ${name}: ${errorMessage}`);
            // Still try to continue with other chains
          }
        }
      }

      // Build more informative message including actual errors
      let message: string;
      const errorDetails: string[] = [];
      
      if (processingErrors.length > 0) {
        errorDetails.push(`Processing errors: ${processingErrors.join('; ')}`);
      }
      if (backfillErrors.length > 0) {
        errorDetails.push(`Backfill errors: ${backfillErrors.join('; ')}`);
      }
      const errorText = errorDetails.length > 0 ? ` Errors: ${errorDetails.join(' | ')}` : '';
      
      message = `Successfully indexed agent ${agentId} on ${processedChains.join(', ')}, triggered full index but encountered errors.${errorText}`;

      return {
        success: processedChains.length > 0,
        message,
        processedChains,
      };
    } catch (error: any) {
      console.error('❌ Error in indexAgent:', error);
      return {
        success: false,
        message: `Error indexing agent: ${error?.message || error}`,
        processedChains: [],
      };
    }
  };
}

