/**
 * Shared GraphQL schema for both local (Express) and Cloudflare Workers implementations
 */

import { buildSchema, GraphQLSchema } from 'graphql';

export const graphQLSchemaString = `
  type Agent {
    chainId: Int!
    agentId: String!
    agentAddress: String!
    agentOwner: String!
    agentName: String!
    metadataURI: String
    createdAtBlock: Int!
    createdAtTime: Int!
    type: String
    description: String
    image: String
    a2aEndpoint: String
    ensEndpoint: String
    agentAccountEndpoint: String
    supportedTrust: String
    rawJson: String
    updatedAtTime: Int
  }

  input AgentSearchParams {
    query: String
    chainId: Int
    agentOwner: String
    agentName: String
    type: String
    hasA2aEndpoint: Boolean
    hasEnsEndpoint: Boolean
    limit: Int
    offset: Int
    orderBy: String
    orderDirection: String
  }

  type AgentSearchResult {
    agents: [Agent!]!
    total: Int!
    hasMore: Boolean!
  }

  type AccessCode {
    address: String!
    accessCode: String!
    createdAt: Int!
  }

  type Query {
    agents(
      chainId: Int
      agentId: String
      agentOwner: String
      agentName: String
      limit: Int
      offset: Int
      orderBy: String
      orderDirection: String
    ): [Agent!]!

    agent(chainId: Int!, agentId: String!): Agent

    agentByName(agentName: String!): Agent

    agentsByChain(chainId: Int!, limit: Int, offset: Int, orderBy: String, orderDirection: String): [Agent!]!

    agentsByOwner(agentOwner: String!, chainId: Int, limit: Int, offset: Int, orderBy: String, orderDirection: String): [Agent!]!

    searchAgents(query: String!, chainId: Int, limit: Int, offset: Int, orderBy: String, orderDirection: String): [Agent!]!

    searchAgentsAdvanced(params: AgentSearchParams!): AgentSearchResult!

    getAccessCode(address: String!): AccessCode

    countAgents(
      chainId: Int
      agentId: String
      agentOwner: String
      agentName: String
    ): Int!
  }

  type Mutation {
    createAccessCode(address: String!): AccessCode!
    indexAgent(agentId: String!, chainId: Int): IndexAgentResult!
  }

  type IndexAgentResult {
    success: Boolean!
    message: String!
    processedChains: [String!]!
  }
`;

/**
 * Build GraphQL schema from shared schema string
 */
export function buildGraphQLSchema(): GraphQLSchema {
  return buildSchema(graphQLSchemaString);
}
