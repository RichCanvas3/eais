/**
 * Cloudflare Workers entry point for ERC8004 Indexer GraphQL API (with Yoga)
 */

import { createYoga, createSchema } from 'graphql-yoga';
import { graphQLSchemaString } from './graphql-schema.js';

// Import shared functions
import { validateAccessCode } from './graphql-resolvers.js';
import { processAgentDirectly } from './process-agent.js';
import { createDBQueries } from './create-resolvers.js';
import { createIndexAgentResolver, type ChainConfig } from './index-agent.js';
import {
  needsAuthentication,
  extractAccessCode,
  validateRequestAccessCode,
  corsHeaders as sharedCorsHeaders,
} from './graphql-handler.js';
import { graphiqlHTML } from './graphiql-template.js';

/**
 * Workers-specific indexAgent resolver factory
 */
async function createWorkersIndexAgentResolver(db: any, env?: any) {
  const chains: ChainConfig[] = [];

  // Get environment variables for RPC URLs and registry addresses
  const ethSepoliaRpc = env?.ETH_SEPOLIA_RPC_URL || env?.ETH_SEPOLIA_RPC_HTTP_URL;
  const baseSepoliaRpc = env?.BASE_SEPOLIA_RPC_URL || env?.BASE_SEPOLIA_RPC_HTTP_URL;
  const opSepoliaRpc = env?.OP_SEPOLIA_RPC_URL || env?.OP_SEPOLIA_RPC_HTTP_URL;
  
  const ethSepoliaRegistry = env?.ETH_SEPOLIA_IDENTITY_REGISTRY;
  const baseSepoliaRegistry = env?.BASE_SEPOLIA_IDENTITY_REGISTRY;
  const opSepoliaRegistry = env?.OP_SEPOLIA_IDENTITY_REGISTRY;

  // Log configuration status for debugging
  console.log('🔧 Chain configuration check:', {
    'ETH Sepolia': { rpc: !!ethSepoliaRpc, registry: !!ethSepoliaRegistry },
    'Base Sepolia': { rpc: !!baseSepoliaRpc, registry: !!baseSepoliaRegistry },
    'Optimism Sepolia': { rpc: !!opSepoliaRpc, registry: !!opSepoliaRegistry },
  });

  if (ethSepoliaRpc && ethSepoliaRegistry) {
    chains.push({
      rpcUrl: ethSepoliaRpc,
      registryAddress: ethSepoliaRegistry,
      chainId: 11155111,
      chainName: 'ETH Sepolia',
    });
  }

  if (baseSepoliaRpc && baseSepoliaRegistry) {
    chains.push({
      rpcUrl: baseSepoliaRpc,
      registryAddress: baseSepoliaRegistry,
      chainId: 84532,
      chainName: 'Base Sepolia',
    });
  }

  if (opSepoliaRpc && opSepoliaRegistry) {
    chains.push({
      rpcUrl: opSepoliaRpc,
      registryAddress: opSepoliaRegistry,
      chainId: 11155420,
      chainName: 'Optimism Sepolia',
    });
  }

  // Create ERC8004Client instances for backfill (dynamically import to avoid Workers compatibility issues)
  const backfillClients: any[] = [];
  try {
    const { ethers } = await import('ethers');
    const { ERC8004Client, EthersAdapter } = await import('@erc8004/sdk');
    
    if (ethSepoliaRpc && ethSepoliaRegistry) {
      const provider = new ethers.JsonRpcProvider(ethSepoliaRpc);
      const adapter = new EthersAdapter(provider);
      backfillClients.push(new ERC8004Client({
        adapter,
        addresses: {
          identityRegistry: ethSepoliaRegistry,
          reputationRegistry: '0x0000000000000000000000000000000000000000',
          validationRegistry: '0x0000000000000000000000000000000000000000',
          chainId: 11155111,
        }
      }));
    }
    
    if (baseSepoliaRpc && baseSepoliaRegistry) {
      const provider = new ethers.JsonRpcProvider(baseSepoliaRpc);
      const adapter = new EthersAdapter(provider);
      backfillClients.push(new ERC8004Client({
        adapter,
        addresses: {
          identityRegistry: baseSepoliaRegistry,
          reputationRegistry: '0x0000000000000000000000000000000000000000',
          validationRegistry: '0x0000000000000000000000000000000000000000',
          chainId: 84532,
        }
      }));
    }
    
    if (opSepoliaRpc && opSepoliaRegistry) {
      const provider = new ethers.JsonRpcProvider(opSepoliaRpc);
      const adapter = new EthersAdapter(provider);
      backfillClients.push(new ERC8004Client({
        adapter,
        addresses: {
          identityRegistry: opSepoliaRegistry,
          reputationRegistry: '0x0000000000000000000000000000000000000000',
          validationRegistry: '0x0000000000000000000000000000000000000000',
          chainId: 11155420,
        }
      }));
    }
  } catch (error) {
    console.warn('⚠️ Failed to create backfill clients (backfill will be disabled):', error);
  }

  // Warn if no chains are configured
  if (chains.length === 0) {
    console.error('❌ No chains configured! Please set the following environment variables in Cloudflare Workers:');
    console.error('   Required for ETH Sepolia: ETH_SEPOLIA_RPC_URL (or ETH_SEPOLIA_RPC_HTTP_URL) and ETH_SEPOLIA_IDENTITY_REGISTRY');
    console.error('   Required for Base Sepolia: BASE_SEPOLIA_RPC_URL (or BASE_SEPOLIA_RPC_HTTP_URL) and BASE_SEPOLIA_IDENTITY_REGISTRY');
    console.error('   Optional for Optimism Sepolia: OP_SEPOLIA_RPC_URL (or OP_SEPOLIA_RPC_HTTP_URL) and OP_SEPOLIA_IDENTITY_REGISTRY');
    console.error('   These can be set as environment variables in wrangler.toml [vars] or as secrets via: wrangler secret put <NAME>');
  } else {
    console.log(`✅ Configured ${chains.length} chain(s) for indexing`);
  }

  // Enable backfill on Workers
  // WARNING: This may timeout on large backfills due to Workers' 30s request limit
  // The backfill will still run but may be interrupted if it takes too long
  return createIndexAgentResolver({
    db,
    chains,
    triggerBackfill: backfillClients.length > 0, // Enable if clients are available
    backfillClients: backfillClients.length > 0 ? backfillClients : undefined,
  });
}

// Create a function that returns createDBQueries with Workers indexAgent
// Note: This is async and must be awaited when called
const createWorkersDBQueries = async (db: any, env?: any) => {
  const indexAgentResolver = await createWorkersIndexAgentResolver(db, env);
  return createDBQueries(db, indexAgentResolver);
};


// GraphiQL HTML template is imported from shared module

// Use shared CORS headers
const corsHeaders = sharedCorsHeaders;

interface Env {
  DB: any; // D1Database type will be available at runtime
  GRAPHQL_SECRET_ACCESS_CODE?: string; // Secret access code for server-to-server authentication
  // Chain configuration - RPC URLs
  ETH_SEPOLIA_RPC_URL?: string;
  ETH_SEPOLIA_RPC_HTTP_URL?: string;
  BASE_SEPOLIA_RPC_URL?: string;
  BASE_SEPOLIA_RPC_HTTP_URL?: string;
  OP_SEPOLIA_RPC_URL?: string;
  OP_SEPOLIA_RPC_HTTP_URL?: string;
  // Chain configuration - Registry addresses
  ETH_SEPOLIA_IDENTITY_REGISTRY?: string;
  BASE_SEPOLIA_IDENTITY_REGISTRY?: string;
  OP_SEPOLIA_IDENTITY_REGISTRY?: string;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: { waitUntil?: (promise: Promise<any>) => void }
  ): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight early
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check stays as a lightweight endpoint
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: 'cloudflare-workers'
      }, { headers: corsHeaders });
    }

    // Serve custom GraphiQL (with default headers/query) like before
    if ((url.pathname === '/graphiql' && request.method === 'GET') ||
        (url.pathname === '/graphql' && request.method === 'GET' && !url.searchParams.get('query'))) {
      return new Response(graphiqlHTML, {
        headers: {
          'Content-Type': 'text/html',
          ...corsHeaders,
        },
      });
    }

    // Build Yoga instance on first request (schema/resolvers are static)
    // Use context per request for DB + auth
    if (!(globalThis as any).__schema) {
      (globalThis as any).__schema = createSchema({
        typeDefs: graphQLSchemaString,
        resolvers: {
          Query: {
            agents: (_p: any, args: any, ctx: any) => ctx.dbQueries.agents(args),
            agent: (_p: any, args: any, ctx: any) => ctx.dbQueries.agent(args),
            agentByName: (_p: any, args: any, ctx: any) => ctx.dbQueries.agentByName(args),
            agentsByChain: (_p: any, args: any, ctx: any) => ctx.dbQueries.agentsByChain(args),
            agentsByOwner: (_p: any, args: any, ctx: any) => ctx.dbQueries.agentsByOwner(args),
            searchAgents: (_p: any, args: any, ctx: any) => ctx.dbQueries.searchAgents(args),
            searchAgentsGraph: (_p: any, args: any, ctx: any) => ctx.dbQueries.searchAgentsGraph(args),
            getAccessCode: (_p: any, args: any, ctx: any) => ctx.dbQueries.getAccessCode(args),
            countAgents: (_p: any, args: any, ctx: any) => ctx.dbQueries.countAgents(args),
          },
          Mutation: {
            createAccessCode: (_p: any, args: any, ctx: any) => ctx.dbQueries.createAccessCode(args),
            indexAgent: (_p: any, args: any, ctx: any) => ctx.dbQueries.indexAgent(args),
          },
        },
      });
    }

    // Create Yoga per request so we can close over env/DB in context
    const yoga = createYoga({
      schema: (globalThis as any).__schema,
      graphqlEndpoint: '/graphql',
      maskedErrors: false,
      context: async ({ request }) => {
        // Parse minimal GraphQL details to decide auth
        let query = '';
        let operationName: string | undefined = undefined;
        try {
          const url2 = new URL(request.url);
          if (request.method === 'POST') {
            const body = await request.clone().json().catch(() => null) as any;
            query = body?.query ?? '';
            operationName = body?.operationName ?? undefined;
          } else if (request.method === 'GET') {
            query = url2.searchParams.get('query') ?? '';
            operationName = url2.searchParams.get('operationName') ?? undefined;
          }
        } catch {}

        // Auth (skip for access-code / indexAgent)
        if (needsAuthentication(query, operationName)) {
          const authHeader = request.headers.get('authorization') || '';
          const accessCode = extractAccessCode(authHeader);
          const secretAccessCode = env.GRAPHQL_SECRET_ACCESS_CODE;
          const validation = await validateRequestAccessCode(accessCode, secretAccessCode, env.DB);
          if (!validation.valid) {
            throw new Error(validation.error || 'Invalid access code');
          }
        }

        // Build per-request DB resolvers (with Workers-aware indexAgent)
        const dbQueries = await createWorkersDBQueries(env.DB, env);
        return { dbQueries };
      },
    });

    // Route all non-health requests through Yoga (including /graphql and /)
    const resp = await yoga.fetch(request);
    // Ensure CORS headers present
    Object.entries(corsHeaders).forEach(([k, v]) => resp.headers.set(k, v));
    return resp;
  },
};

