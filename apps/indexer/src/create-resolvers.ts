/**
 * Shared function to create GraphQL resolvers with environment-specific indexAgent
 */

import { createGraphQLResolvers } from './graphql-resolvers.js';

/**
 * Create GraphQL resolvers with optional custom indexAgent resolver
 * This unifies the resolver creation for both Express (local) and Workers (production)
 */
export function createDBQueries(
  db: any,
  indexAgentResolver?: (args: { agentId: string; chainId?: number }, env?: any) => Promise<any>
) {
  const sharedResolvers = createGraphQLResolvers(db);
  
  if (indexAgentResolver) {
    return {
      ...sharedResolvers,
      indexAgent: indexAgentResolver,
    };
  }
  
  return sharedResolvers;
}

