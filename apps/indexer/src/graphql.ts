import { createHandler } from 'graphql-http/lib/use/express';
import { GraphQLSchema } from 'graphql';
import { buildGraphQLSchema } from './graphql-schema';
import express from 'express';
import { db, formatSQLTimestamp, getCheckpoint, setCheckpoint } from './db';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { ERC8004Client, EthersAdapter } from '@erc8004/sdk';
import { processAgentDirectly } from './process-agent';
import { createGraphQLResolvers, validateAccessCode as validateAccessCodeShared } from './graphql-resolvers';
import { createDBQueries } from './create-resolvers';
import {
  needsAuthentication,
  extractAccessCode,
  validateRequestAccessCode,
  executeGraphQL,
  parseGraphQLRequestExpress,
  corsHeaders,
  type GraphQLRequest,
} from './graphql-handler';
import { graphiqlHTML } from './graphiql-template';
import { createIndexAgentResolver, type ChainConfig } from './index-agent';
import { 
  ETH_SEPOLIA_IDENTITY_REGISTRY, 
  BASE_SEPOLIA_IDENTITY_REGISTRY, 
  OP_SEPOLIA_IDENTITY_REGISTRY,
  ETH_SEPOLIA_RPC_HTTP_URL, 
  BASE_SEPOLIA_RPC_HTTP_URL,
  OP_SEPOLIA_RPC_HTTP_URL,
  ETH_SEPOLIA_GRAPHQL_URL,
  BASE_SEPOLIA_GRAPHQL_URL,
  OP_SEPOLIA_GRAPHQL_URL,
  GRAPHQL_API_KEY
} from './env';

// CORS configuration to allow Authorization header
const cors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
};

// Use shared schema
const schema = buildGraphQLSchema();

// Helper function to parse JSON fields (if still needed for indexAgent)
function parseJsonField<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// Use shared validateAccessCode function
const validateAccessCode = (accessCode: string | null | undefined) => validateAccessCodeShared(db, accessCode);

// Define local indexAgent resolver using shared function
const chains: ChainConfig[] = [
  {
    rpcUrl: ETH_SEPOLIA_RPC_HTTP_URL,
    registryAddress: ETH_SEPOLIA_IDENTITY_REGISTRY,
    chainId: 11155111,
    chainName: 'ETH Sepolia',
  },
  {
    rpcUrl: BASE_SEPOLIA_RPC_HTTP_URL,
    registryAddress: BASE_SEPOLIA_IDENTITY_REGISTRY,
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

// Create backfill clients for full indexing
const backfillClients: ERC8004Client[] = [
  new ERC8004Client({
    adapter: new EthersAdapter(new ethers.JsonRpcProvider(ETH_SEPOLIA_RPC_HTTP_URL)),
    addresses: {
      identityRegistry: ETH_SEPOLIA_IDENTITY_REGISTRY,
      reputationRegistry: '0x0000000000000000000000000000000000000000',
      validationRegistry: '0x0000000000000000000000000000000000000000',
      chainId: 11155111,
    }
  }),
  new ERC8004Client({
    adapter: new EthersAdapter(new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_HTTP_URL)),
    addresses: {
      identityRegistry: BASE_SEPOLIA_IDENTITY_REGISTRY,
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

// Create resolvers using shared function
const root = createDBQueries(db, localIndexAgentResolver);

// processAgentDirectly is now imported from './process-agent'

// Create GraphQL handler
// graphql-http's Express handler automatically reads from req.body when it's parsed
// Make sure req.body is parsed before this handler runs (express.json() does this)
const handler = createHandler({
  schema: schema as GraphQLSchema,
  rootValue: root,
  context: () => ({}),
});

export function createGraphQLServer(port: number = 4000) {
  const app = express();

  // Enable CORS to allow Authorization header from GraphiQL
  app.use(cors);
  
  // Parse JSON body - graphql-http's Express handler expects req.body to be parsed
  app.use(express.json());

  // Request logging middleware (after body parsing)
  // Only log, don't modify req.body - graphql-http needs it intact
  app.use((req, res, next) => {
    if (req.path === '/graphql' && req.method === 'POST') {
      console.log(`📥 GraphQL Request - Body:`, JSON.stringify(req.body).substring(0, 200));
    }
    next();
  });

  // Access code authentication middleware - using shared handler logic
  app.use('/graphql', async (req, res, next) => {
    // Only apply auth to POST requests (GET requests show GraphiQL UI)
    if (req.method !== 'POST') {
      return next();
    }

    const request = parseGraphQLRequestExpress(req);
    
    // Check if authentication is needed
    if (!needsAuthentication(request.query, request.operationName)) {
      return next();
    }

    // Extract and validate access code
    const authHeader = req.headers.authorization || '';
    const accessCode = extractAccessCode(authHeader);
    const secretAccessCode = process.env.GRAPHQL_SECRET_ACCESS_CODE;
    
    const validation = await validateRequestAccessCode(accessCode, secretAccessCode, db);
    if (!validation.valid) {
      return res.status(401).json({
        errors: [{ message: validation.error || 'Invalid access code' }]
      });
    }

    next();
  });

  // GraphQL endpoint - show GraphiQL UI on GET, handle queries on POST
  console.info("............graphiql 1: /graphql")
  app.get('/graphql', (req, res) => {
    res.send(graphiqlHTML);
  });

  // Handle POST requests for GraphQL queries
  // graphql-http's createHandler from 'use/express' returns Express middleware
  // It should automatically read from req.body (parsed by express.json())
  console.info("............graphiql 2: /graphql")
  app.post('/graphql', handler);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Simple GraphiQL endpoint - same as /graphql
  console.info("............graphiql: /graphiql")
  app.get('/graphiql', (req, res) => {
    res.send(graphiqlHTML);
  });

  const server = app.listen(port, () => {
    console.log(`🚀 GraphQL server running at http://localhost:${port}/graphql`);
    console.log(`📊 GraphiQL playground available at:`);
    console.log(`   - http://localhost:${port}/graphql (GET - GraphiQL UI)`);
    console.log(`   - http://localhost:${port}/graphiql (GET - GraphiQL UI, alternative)`);
  });

  return server;
}

