import 'dotenv/config';
import { createServer } from 'http';
import { createYoga, createSchema } from 'graphql-yoga';
import { graphQLSchemaString } from './graphql-schema';
import { createDBQueries } from './create-resolvers';
import { db } from './db';
import {
  needsAuthentication,
  extractAccessCode,
  validateRequestAccessCode,
} from './graphql-handler';
import { createIndexAgentResolver, type ChainConfig } from './index-agent';
import {
  ETH_SEPOLIA_IDENTITY_REGISTRY,
  BASE_SEPOLIA_IDENTITY_REGISTRY,
  OP_SEPOLIA_IDENTITY_REGISTRY,
  ETH_SEPOLIA_RPC_HTTP_URL,
  BASE_SEPOLIA_RPC_HTTP_URL,
  OP_SEPOLIA_RPC_HTTP_URL,
} from './env';
import { ERC8004Client, EthersAdapter } from '@erc8004/sdk';
import { ethers } from 'ethers';

async function createYogaGraphQLServer(port: number = Number(process.env.GRAPHQL_SERVER_PORT ?? 4000)) {
  // Configure chains (same as express server)
  const chains: ChainConfig[] = [
    {
      rpcUrl: ETH_SEPOLIA_RPC_HTTP_URL,
      registryAddress: ETH_SEPOLIA_IDENTITY_REGISTRY!,
      chainId: 11155111,
      chainName: 'ETH Sepolia',
    },
    {
      rpcUrl: BASE_SEPOLIA_RPC_HTTP_URL,
      registryAddress: BASE_SEPOLIA_IDENTITY_REGISTRY!,
      chainId: 84532,
      chainName: 'Base Sepolia',
    },
  ];

  if (OP_SEPOLIA_RPC_HTTP_URL && OP_SEPOLIA_IDENTITY_REGISTRY) {
    chains.push({
      rpcUrl: OP_SEPOLIA_RPC_HTTP_URL,
      registryAddress: OP_SEPOLIA_IDENTITY_REGISTRY,
      chainId: 11155420,
      chainName: 'Optimism Sepolia',
    });
  }

  // Backfill clients for optional full indexing trigger
  const backfillClients: ERC8004Client[] = [
    new ERC8004Client({
      adapter: new EthersAdapter(new ethers.JsonRpcProvider(ETH_SEPOLIA_RPC_HTTP_URL)),
      addresses: {
        identityRegistry: ETH_SEPOLIA_IDENTITY_REGISTRY!,
        reputationRegistry: '0x0000000000000000000000000000000000000000',
        validationRegistry: '0x0000000000000000000000000000000000000000',
        chainId: 11155111,
      }
    }),
    new ERC8004Client({
      adapter: new EthersAdapter(new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_HTTP_URL)),
      addresses: {
        identityRegistry: BASE_SEPOLIA_IDENTITY_REGISTRY!,
        reputationRegistry: '0x0000000000000000000000000000000000000000',
        validationRegistry: '0x0000000000000000000000000000000000000000',
        chainId: 84532,
      }
    }),
  ];

  if (OP_SEPOLIA_RPC_HTTP_URL && OP_SEPOLIA_IDENTITY_REGISTRY) {
    backfillClients.push(
      new ERC8004Client({
        adapter: new EthersAdapter(new ethers.JsonRpcProvider(OP_SEPOLIA_RPC_HTTP_URL)),
        addresses: {
          identityRegistry: OP_SEPOLIA_IDENTITY_REGISTRY,
          reputationRegistry: '0x0000000000000000000000000000000000000000',
          validationRegistry: '0x0000000000000000000000000000000000000000',
          chainId: 11155420,
        }
      })
    );
  }

  const localIndexAgentResolver = await createIndexAgentResolver({
    db,
    chains,
    triggerBackfill: true,
    backfillClients,
  });

  // Create shared resolvers and adapt to Yoga-style resolvers map
  const shared = createDBQueries(db, localIndexAgentResolver) as any;
  const resolvers = {
    Query: {
      agents: (_parent: unknown, args: any) => shared.agents(args),
      agent: (_parent: unknown, args: any) => shared.agent(args),
      agentByName: (_parent: unknown, args: any) => shared.agentByName(args),
      agentsByChain: (_parent: unknown, args: any) => shared.agentsByChain(args),
      agentsByOwner: (_parent: unknown, args: any) => shared.agentsByOwner(args),
      searchAgents: (_parent: unknown, args: any) => shared.searchAgents(args),
      searchAgentsGraph: (_parent: unknown, args: any) => shared.searchAgentsGraph(args),
      getAccessCode: (_parent: unknown, args: any) => shared.getAccessCode(args),
      countAgents: (_parent: unknown, args: any) => shared.countAgents(args),
    },
    Mutation: {
      createAccessCode: (_parent: unknown, args: any) => shared.createAccessCode(args),
      indexAgent: (_parent: unknown, args: any) => shared.indexAgent(args),
    },
  };

  const schema = createSchema({
    typeDefs: graphQLSchemaString,
    resolvers,
  });

  const yoga = createYoga({
    schema,
    graphqlEndpoint: '/graphql',
    maskedErrors: false,
    // Auth in Yoga context (mirrors Express middleware behavior)
    context: async ({ request }) => {
      try {
        const url = new URL(request.url, 'http://localhost');
        let body: any = null;
        if (request.method === 'POST') {
          try {
            body = await request.clone().json();
          } catch {
            body = null;
          }
        }
        const query = body?.query || url.searchParams.get('query') || '';
        const operationName = body?.operationName || url.searchParams.get('operationName') || undefined;

        if (needsAuthentication(query, operationName)) {
          const authHeader = request.headers.get('authorization') || '';
          const accessCode = extractAccessCode(authHeader);
          const secretAccessCode = process.env.GRAPHQL_SECRET_ACCESS_CODE;
          const validation = await validateRequestAccessCode(accessCode, secretAccessCode, db);
          if (!validation.valid) {
            throw new Error(validation.error || 'Invalid access code');
          }
        }
      } catch {
        // If parsing fails, fall through - GraphQL execution will handle errors
      }
      return {};
    },
  });

  const server = createServer(yoga);
  server.listen(port, () => {
    console.log(`🧘 Yoga GraphQL server running at http://localhost:${port}/graphql`);
  });
}

void createYogaGraphQLServer();


