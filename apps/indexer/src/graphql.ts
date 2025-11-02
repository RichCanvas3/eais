import { createHandler } from 'graphql-http/lib/use/express';
import { buildSchema, GraphQLSchema } from 'graphql';
import express from 'express';
import { db, formatSQLTimestamp, getCheckpoint, setCheckpoint } from './db';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { ERC8004Client, EthersAdapter } from '@erc8004/sdk';
import { processAgentDirectly } from './process-agent';
import { createGraphQLResolvers, validateAccessCode as validateAccessCodeShared } from './graphql-resolvers';
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
import { backfill } from './indexer';

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

const schema = buildSchema(`
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
    
    agentsByChain(chainId: Int!, limit: Int, offset: Int, orderBy: String, orderDirection: String): [Agent!]!
    
    agentsByOwner(agentOwner: String!, chainId: Int, limit: Int, offset: Int, orderBy: String, orderDirection: String): [Agent!]!
    
    searchAgents(query: String!, chainId: Int, limit: Int, offset: Int, orderBy: String, orderDirection: String): [Agent!]!
    
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
`);

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

// Get shared resolvers and add the indexAgent resolver
const sharedResolvers = createGraphQLResolvers(db);
const root = {
  // Use all shared resolvers
  ...sharedResolvers,

  indexAgent: async (args: { agentId: string; chainId?: number }) => {
    try {
      const { agentId, chainId } = args;
      const agentIdBigInt = BigInt(agentId);
      const processedChains: string[] = [];

      // Initialize ERC8004 clients for each chain
      const ethSepoliaProvider = new ethers.JsonRpcProvider(ETH_SEPOLIA_RPC_HTTP_URL);
      const ethSepoliaAdapter = new EthersAdapter(ethSepoliaProvider);
      const erc8004EthSepoliaClient = new ERC8004Client({
        adapter: ethSepoliaAdapter,
        addresses: {
          identityRegistry: ETH_SEPOLIA_IDENTITY_REGISTRY,
          reputationRegistry: '0x0000000000000000000000000000000000000000',
          validationRegistry: '0x0000000000000000000000000000000000000000',
          chainId: 11155111,
        }
      });

      const baseSepoliaProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_HTTP_URL);
      const baseSepoliaAdapter = new EthersAdapter(baseSepoliaProvider);
      const erc8004BaseSepoliaClient = new ERC8004Client({
        adapter: baseSepoliaAdapter,
        addresses: {
          identityRegistry: BASE_SEPOLIA_IDENTITY_REGISTRY,
          reputationRegistry: '0x0000000000000000000000000000000000000000',
          validationRegistry: '0x0000000000000000000000000000000000000000',
          chainId: 84532,
        }
      });

      // Determine which chains to process
      const chainsToProcess: Array<{ name: string; client: ERC8004Client; chainId: number }> = [];
      
      if (chainId === undefined || chainId === 11155111) {
        chainsToProcess.push({ name: 'ETH Sepolia', client: erc8004EthSepoliaClient, chainId: 11155111 });
      }
      
      if (chainId === undefined || chainId === 84532) {
        chainsToProcess.push({ name: 'Base Sepolia', client: erc8004BaseSepoliaClient, chainId: 84532 });
      }

      if (OP_SEPOLIA_RPC_HTTP_URL && OP_SEPOLIA_IDENTITY_REGISTRY) {
        if (chainId === undefined || chainId === 11155420) {
          const opSepoliaProvider = new ethers.JsonRpcProvider(OP_SEPOLIA_RPC_HTTP_URL);
          const opSepoliaAdapter = new EthersAdapter(opSepoliaProvider);
          const erc8004OpSepoliaClient = new ERC8004Client({
            adapter: opSepoliaAdapter,
            addresses: {
              identityRegistry: OP_SEPOLIA_IDENTITY_REGISTRY,
              reputationRegistry: '0x0000000000000000000000000000000000000000',
              validationRegistry: '0x0000000000000000000000000000000000000000',
              chainId: 11155420,
            }
          });
          chainsToProcess.push({ name: 'Optimism Sepolia', client: erc8004OpSepoliaClient, chainId: 11155420 });
        }
      }

      // Process each chain
      for (const { name, client, chainId: cId } of chainsToProcess) {
        try {
          // Check if agent exists by trying to get owner
          const owner = await client.identity.getOwner(agentIdBigInt);
          const tokenURI = await client.identity.getTokenURI(agentIdBigInt).catch(() => null);
          
          // Get current block number
          const publicClient = (client as any).adapter?.provider;
          let blockNumber = 0n;
          try {
            const block = await publicClient?.getBlockNumber?.() || await publicClient?.getBlock?.('latest');
            blockNumber = block?.number ? BigInt(block.number) : 0n;
          } catch {
            blockNumber = 0n;
          }
          
          if (owner && owner !== '0x0000000000000000000000000000000000000000') {
            // Import helper functions from indexer.ts logic (duplicated here for GraphQL)
            await processAgentDirectly(owner.toLowerCase(), agentIdBigInt, blockNumber, tokenURI, cId, db);
            processedChains.push(name);
          }
        } catch (error: any) {
          console.log(`  ⚠️  Agent ${agentId} not found on ${name}: ${error?.message || error}`);
        }
      }

      // After indexing the specific agent, trigger a full backfill for all chains
      console.log('🔄 Triggering full index after agent indexing...');
      try {
        await backfill(erc8004EthSepoliaClient);
      } catch (error: any) {
        console.warn('⚠️ Error in ETH Sepolia backfill:', error?.message || error);
      }
      
      try {
        await backfill(erc8004BaseSepoliaClient);
      } catch (error: any) {
        console.warn('⚠️ Error in Base Sepolia backfill:', error?.message || error);
      }
      
      if (OP_SEPOLIA_RPC_HTTP_URL && OP_SEPOLIA_IDENTITY_REGISTRY) {
        try {
          const opSepoliaProvider = new ethers.JsonRpcProvider(OP_SEPOLIA_RPC_HTTP_URL);
          const opSepoliaAdapter = new EthersAdapter(opSepoliaProvider);
          const erc8004OpSepoliaClient = new ERC8004Client({
            adapter: opSepoliaAdapter,
            addresses: {
              identityRegistry: OP_SEPOLIA_IDENTITY_REGISTRY,
              reputationRegistry: '0x0000000000000000000000000000000000000000',
              validationRegistry: '0x0000000000000000000000000000000000000000',
              chainId: 11155420,
            }
          });
          await backfill(erc8004OpSepoliaClient);
        } catch (error: any) {
          console.warn('⚠️ Error in Optimism Sepolia backfill:', error?.message || error);
        }
      }
      
      console.log('✅ Full index completed');

      return {
        success: processedChains.length > 0,
        message: processedChains.length > 0
          ? `Successfully indexed agent ${agentId} on ${processedChains.join(', ')} and triggered full index`
          : `Agent ${agentId} not found on any chain, but triggered full index`,
        processedChains,
      };
    } catch (error: any) {
      console.error('❌ Error in indexAgent resolver:', error);
      throw error;
    }
  },
};

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

  // Access code authentication middleware - simple version
  app.use('/graphql', async (req, res, next) => {
    // Only apply auth to POST requests (GET requests show GraphiQL UI)
    if (req.method !== 'POST') {
      return next();
    }

    // Skip auth for getAccessCode, createAccessCode, and indexAgent operations
    const queryString = (req.body?.query || '').toString();
    const isAccessCodeOperation = 
      queryString.includes('getAccessCode') || 
      queryString.includes('createAccessCode');
    const isIndexAgentOperation = queryString.includes('indexAgent');
    
    if (isAccessCodeOperation || isIndexAgentOperation) {
      return next();
    }

    // Extract access code from Authorization header
    const authHeader = req.headers.authorization || '';
    const accessCode = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7).trim() 
      : authHeader.trim();

    if (!accessCode) {
      return res.status(401).json({
        errors: [{ message: 'Access code required. Please provide Authorization header with your access code.' }]
      });
    }

    // Check secret access code from environment variable (for server-to-server)
    const secretAccessCode = process.env.GRAPHQL_SECRET_ACCESS_CODE;
    if (secretAccessCode && accessCode === secretAccessCode) {
      return next();
    }

    // Validate regular user access code
    const isValid = await validateAccessCode(accessCode);
    if (!isValid) {
      return res.status(401).json({
        errors: [{ message: 'Invalid access code. Please get your access code via the createAccessCode mutation.' }]
      });
    }

    next();
  });

  // GraphQL endpoint - show GraphiQL UI on GET, handle queries on POST
  console.info("............graphiql 1: /graphql")
  app.get('/graphql', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GraphiQL - ERC8004 Indexer</title>
          <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
          <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
          <script src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
        </head>
        <body style="margin: 0;">
          <div id="graphiql" style="height: 100vh;"></div>
          <script>
            const graphQLFetcher = (graphQLParams) => {
              // Get Authorization header from localStorage if available
              let headers = { 'Content-Type': 'application/json' };
              try {
                const savedHeaders = localStorage.getItem('graphiql:headers') || localStorage.getItem('graphiql-headers');
                if (savedHeaders) {
                  const parsed = JSON.parse(savedHeaders);
                  if (parsed.Authorization) {
                    headers['Authorization'] = parsed.Authorization;
                  }
                }
              } catch (e) {
                // Ignore
              }
              
              return fetch('/graphql', {
                method: 'post',
                headers: headers,
                body: JSON.stringify(graphQLParams),
              }).then(response => response.json());
            };
            
            ReactDOM.render(
              React.createElement(GraphiQL, { 
                fetcher: graphQLFetcher,
                headerEditorEnabled: true,
                shouldPersistHeaders: true,
                defaultHeaders: JSON.stringify({
                  "Authorization": "Bearer YOUR_ACCESS_CODE_HERE"
                }, null, 2)
              }),
              document.getElementById('graphiql')
            );
          </script>
        </body>
      </html>
    `);
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
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GraphiQL - ERC8004 Indexer</title>
          <link rel="stylesheet" href="https://unpkg.com/graphiql@3/graphiql.min.css" />
          <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
          <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
          <script src="https://unpkg.com/graphiql@3/graphiql.min.js"></script>
        </head>
        <body style="margin: 0;">
          <div id="graphiql" style="height: 100vh;"></div>
          <script>
            // Read access code from URL parameters (query string or hash) and set it for GraphiQL
            let accessCode = null;
            let defaultHeadersValue = JSON.stringify({
              "Authorization": "Bearer YOUR_ACCESS_CODE_HERE"
            }, null, 2);
            
            (function() {
              // First, try to read from URL query parameters
              const urlParams = new URLSearchParams(window.location.search);
              accessCode = urlParams.get('accessCode');
              
              // If not found in query params, try hash (for backward compatibility)
              if (!accessCode) {
                const hash = window.location.hash;
                if (hash) {
                  const match = hash.match(/accessCode=([^&]+)/);
                  if (match) {
                    accessCode = decodeURIComponent(match[1]);
                  }
                }
              }
              
              if (accessCode) {
                const headersObj = { Authorization: \`Bearer \${accessCode}\` };
                const headersJson = JSON.stringify(headersObj, null, 2);
                
                // Set the defaultHeadersValue to use in GraphiQL initialization
                defaultHeadersValue = headersJson;
                
                // Store in localStorage keys that GraphiQL checks
                const possibleKeys = [
                  'graphiql:headers',
                  'graphiql-headers',
                  'graphiql.headers',
                  'graphiql-headers-v3',
                  'graphiql@3:headers'
                ];
                
                possibleKeys.forEach(key => {
                  try {
                    localStorage.setItem(key, headersJson);
                    console.log('✅ Set access code in localStorage key:', key);
                  } catch (e) {
                    console.warn('Failed to set localStorage key ' + key + ':', e);
                  }
                });
                
                // Also set a global variable for the fetcher to use
                window.graphiqlHeaders = headersObj;
                console.log('✅ Set access code from URL parameters:', accessCode.substring(0, 10) + '...');
                
                // Clean up the parameters from URL (optional, for cleaner URL)
                const cleanUrl = window.location.pathname;
                window.history.replaceState(null, '', cleanUrl);
              }
            })();
            
            const graphQLFetcher = async (graphQLParams) => {
              // Get Authorization header from multiple sources
              let headers = { 'Content-Type': 'application/json' };
              
              try {
                // Method 1: Check global store
                if (window.graphiqlHeaders && Object.keys(window.graphiqlHeaders).length > 0) {
                  Object.assign(headers, window.graphiqlHeaders);
                }
                
                // Method 2: Check localStorage
                const savedHeaders = localStorage.getItem('graphiql:headers') || localStorage.getItem('graphiql-headers');
                if (savedHeaders) {
                  const parsed = JSON.parse(savedHeaders);
                  if (parsed.Authorization) {
                    headers['Authorization'] = parsed.Authorization;
                  }
                }
                
                // Method 3: Try to read from header editor DOM element
                const headerSelectors = [
                  'textarea[aria-label*="header" i]',
                  '.graphiql-headers-editor textarea',
                  '.graphiql-editor[aria-label*="header" i]'
                ];
                
                for (const selector of headerSelectors) {
                  const headerEditor = document.querySelector(selector);
                  if (headerEditor && headerEditor.value && headerEditor.value.trim()) {
                    try {
                      const parsed = JSON.parse(headerEditor.value.trim());
                      if (parsed.Authorization) {
                        headers['Authorization'] = parsed.Authorization;
                        break;
                      }
                    } catch (e) {
                      // Not valid JSON, continue
                    }
                  }
                }
              } catch (e) {
                console.error('Error extracting headers:', e);
              }
              
              return fetch('/graphql', {
                method: 'post',
                headers: headers,
                body: JSON.stringify(graphQLParams),
              }).then(response => response.json());
            };
            
            // Set default query value
            const defaultQueryValue = \`query {
  agentsByChain(chainId: 11155111, limit: 10, orderBy: "agentId", orderDirection: "desc") {
    agentId
    agentName
    agentAddress
    description
    a2aEndpoint
  }
}\`;
            
            ReactDOM.render(
              React.createElement(GraphiQL, { 
                fetcher: graphQLFetcher,
                query: defaultQueryValue,
                defaultQuery: defaultQueryValue,
                headerEditorEnabled: true,
                shouldPersistHeaders: true,
                defaultHeaders: defaultHeadersValue
              }),
              document.getElementById('graphiql')
            );
            
            // After GraphiQL renders, programmatically set the query editor value
            setTimeout(() => {
              const querySelectors = [
                'textarea[aria-label*="query" i]',
                '.graphiql-query-editor textarea',
                '.graphiql-editor[aria-label*="query" i]',
                '.graphiql-editor:first-of-type textarea',
                '#graphiql-query',
                '.graphiql-editor textarea'
              ];
              
              for (const selector of querySelectors) {
                const queryEditor = document.querySelector(selector);
                if (queryEditor && queryEditor.tagName === 'TEXTAREA' && (!queryEditor.value || queryEditor.value.trim() === '')) {
                  queryEditor.value = defaultQueryValue;
                  ['input', 'change'].forEach(eventType => {
                    const event = new Event(eventType, { bubbles: true });
                    queryEditor.dispatchEvent(event);
                  });
                  console.log('✅ Set query editor value:', selector);
                  break;
                }
              }
            }, 200);
            
            // After GraphiQL renders, programmatically set the header editor value if we have an access code
            if (accessCode) {
              const headersJson = JSON.stringify({ Authorization: \`Bearer \${accessCode}\` }, null, 2);
              const headerSelectors = [
                'textarea[aria-label*="header" i]',
                'textarea[placeholder*="header" i]',
                '.graphiql-headers-editor textarea',
                '.graphiql-editor[aria-label*="header" i]',
                '[data-name="headers"]',
                '#graphiql-headers'
              ];
              
              // Try multiple times with increasing delays to catch GraphiQL after it renders
              const attempts = [100, 300, 500, 1000];
              attempts.forEach((delay, idx) => {
                setTimeout(() => {
                  for (const selector of headerSelectors) {
                    const headerEditor = document.querySelector(selector);
                    if (headerEditor && headerEditor.tagName === 'TEXTAREA') {
                      headerEditor.value = headersJson;
                      // Trigger multiple events to ensure GraphiQL picks it up
                      ['input', 'change', 'blur'].forEach(eventType => {
                        const event = new Event(eventType, { bubbles: true });
                        headerEditor.dispatchEvent(event);
                      });
                      console.log('✅ Set header editor value via DOM (attempt ' + (idx + 1) + '):', selector);
                      return;
                    }
                  }
                }, delay);
              });
              
              // Also use MutationObserver to catch it when it appears
              const observer = new MutationObserver(() => {
                for (const selector of headerSelectors) {
                  const headerEditor = document.querySelector(selector);
                  if (headerEditor && headerEditor.tagName === 'TEXTAREA' && headerEditor.value !== headersJson) {
                    headerEditor.value = headersJson;
                    ['input', 'change', 'blur'].forEach(eventType => {
                      const event = new Event(eventType, { bubbles: true });
                      headerEditor.dispatchEvent(event);
                    });
                    console.log('✅ Set header editor value via MutationObserver:', selector);
                    observer.disconnect();
                    return;
                  }
                }
              });
              
              observer.observe(document.body, {
                childList: true,
                subtree: true
              });
              
              // Disconnect observer after 5 seconds
              setTimeout(() => observer.disconnect(), 5000);
            }
          </script>
        </body>
      </html>
    `);
  });

  const server = app.listen(port, () => {
    console.log(`🚀 GraphQL server running at http://localhost:${port}/graphql`);
    console.log(`📊 GraphiQL playground available at:`);
    console.log(`   - http://localhost:${port}/graphql (GET - GraphiQL UI)`);
    console.log(`   - http://localhost:${port}/graphiql (GET - GraphiQL UI, alternative)`);
  });

  return server;
}

