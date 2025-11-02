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

      // Process each chain
      for (const { name, provider, client, chainId: cId } of chainsToProcess) {
        try {
          // Check if agent exists by trying to get owner
          const owner = await client.identity.getOwner(agentIdBigInt);
          console.log("............owner: ", owner, "agentIdBigInt: ", agentIdBigInt);
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
      // Optionally trigger full backfill (only for local/Express)
      // Note: Backfill runs regardless of whether the specific agent was found
      // This allows "refresh indexer" to work even when the trigger agentId doesn't exist
      const backfillTriggered = config.triggerBackfill && config.backfillClients && config.backfillClients.length > 0;
      
      if (config.triggerBackfill && config.backfillClients) {
        console.log('🔄 Triggering full index after agent indexing...');
        // Dynamically import backfill to avoid circular dependencies
        const { backfill } = await import('./indexer');
        for (const backfillClient of config.backfillClients) {
          try {
            await backfill(backfillClient);
          } catch (error: any) {
            const errorMessage = error?.message || String(error);
            const fullError = error?.stack ? `${errorMessage}\n${error.stack}` : errorMessage;
            backfillErrors.push(`Chain ${backfillClient.getChainId()}: ${fullError}`);
            console.warn(`⚠️ Error in backfill for ${backfillClient.getChainId()}:`, errorMessage);
          }
        }
        if (backfillErrors.length === 0) {
          console.log('✅ Full index completed');
        } else {
          console.warn(`⚠️ Full index completed with ${backfillErrors.length} error(s)`);
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
      
      if (processedChains.length > 0) {
        if (backfillTriggered) {
          if (backfillErrors.length > 0) {
            message = `Successfully indexed agent ${agentId} on ${processedChains.join(', ')}, triggered full index but encountered errors.${errorText}`;
          } else {
            message = `Successfully indexed agent ${agentId} on ${processedChains.join(', ')} and triggered full index${errorText}`;
          }
        } else {
          message = `Successfully indexed agent ${agentId} on ${processedChains.join(', ')}${errorText}`;
        }
      } else {
        // Agent wasn't processed on any chain
        if (backfillTriggered) {
          if (backfillErrors.length > 0) {
            message = `Agent ${agentId} not found on any configured chain, but triggered full index which failed.${errorText}`;
          } else {
            message = `Agent ${agentId} not found on any configured chain, but triggered full index (which may have succeeded)${errorText}`;
          }
        } else {
          if (processingErrors.length > 0) {
            message = `Agent ${agentId} not found on any configured chain, but encountered processing errors.${errorText}`;
          } else {
            message = `Agent ${agentId} not found on any configured chain.${errorText}`;
          }
        }
      }
      
      return {
        success: processedChains.length > 0 || (backfillTriggered && backfillErrors.length === 0),
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

