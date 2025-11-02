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
            await processAgentDirectly(owner.toLowerCase(), agentIdBigInt, blockNumber, tokenURI, cId, config.db);
            processedChains.push(name);
          }
        } catch (error: any) {
          console.log(`⚠️ Agent ${agentId} not found on ${name}: ${error?.message || error}`);
        }
      }

      // Optionally trigger full backfill (only for local/Express)
      // Note: Backfill runs regardless of whether the specific agent was found
      // This allows "refresh indexer" to work even when the trigger agentId doesn't exist
      if (config.triggerBackfill && config.backfillClients) {
        console.log('🔄 Triggering full index after agent indexing...');
        // Dynamically import backfill to avoid circular dependencies
        const { backfill } = await import('./indexer');
        for (const backfillClient of config.backfillClients) {
          try {
            await backfill(backfillClient);
          } catch (error: any) {
            console.warn(`⚠️ Error in backfill for ${backfillClient.getChainId()}:`, error?.message || error);
          }
        }
        console.log('✅ Full index completed');
      }

      // If backfill was triggered, consider it a success even if the specific agent wasn't found
      const backfillTriggered = config.triggerBackfill && config.backfillClients && config.backfillClients.length > 0;
      
      return {
        success: processedChains.length > 0 || backfillTriggered,
        message: processedChains.length > 0
          ? config.triggerBackfill
            ? `Successfully indexed agent ${agentId} on ${processedChains.join(', ')} and triggered full index`
            : `Successfully indexed agent ${agentId} on ${processedChains.join(', ')}`
          : config.triggerBackfill
            ? `Agent ${agentId} not found on any chain, but triggered full index`
            : `Agent ${agentId} not found on any configured chain`,
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

