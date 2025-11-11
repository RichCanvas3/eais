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
    did: String
    mcp: Boolean
    x402support: Boolean
    active: Boolean
  }

  enum AgentOrderBy {
    agentId
    agentName
    createdAtTime
    createdAtBlock
    agentOwner
  }

  enum OrderDirection {
    ASC
    DESC
  }

  input AgentWhereInput {
    chainId: Int
    chainId_in: [Int!]

    agentId: String
    agentId_in: [String!]

    agentOwner: String
    agentOwner_in: [String!]

    agentName_contains: String
    agentName_contains_nocase: String
    agentName_starts_with: String
    agentName_starts_with_nocase: String
    agentName_ends_with: String
    agentName_ends_with_nocase: String

    description_contains: String
    description_contains_nocase: String

    ensEndpoint_contains: String
    ensEndpoint_contains_nocase: String
    agentAccountEndpoint_contains: String
    agentAccountEndpoint_contains_nocase: String

    did: String
    did_contains: String
    did_contains_nocase: String

    createdAtTime_gt: Int
    createdAtTime_gte: Int
    createdAtTime_lt: Int
    createdAtTime_lte: Int

    hasA2aEndpoint: Boolean
    hasEnsEndpoint: Boolean

    mcp: Boolean
    x402support: Boolean
    active: Boolean

    operator_in: [String!]
    supportedTrust_in: [String!]
    a2aSkills_in: [String!]
    mcpTools_in: [String!]
    mcpPrompts_in: [String!]
    mcpResources_in: [String!]
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

    searchAgentsGraph(
      where: AgentWhereInput
      first: Int
      skip: Int
      orderBy: AgentOrderBy
      orderDirection: OrderDirection
    ): AgentSearchResult!

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
