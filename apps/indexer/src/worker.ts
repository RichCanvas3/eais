/**
 * Cloudflare Workers entry point for ERC8004 Indexer GraphQL API
 */

import { graphql, type GraphQLSchema } from 'graphql';
import { buildSchema } from 'graphql';

// Import shared functions
import { createGraphQLResolvers, validateAccessCode } from './graphql-resolvers.js';
import { processAgentDirectly } from './process-agent.js';

/**
 * Create database queries with Workers-specific indexAgent resolver
 */
function createDBQueries(db: any, env?: any) {
  // Get shared resolvers (all except indexAgent)
  const sharedResolvers = createGraphQLResolvers(db);
  
  return {
    // Use all shared resolvers
    ...sharedResolvers,

    indexAgent: async (args: { agentId: string; chainId?: number }) => {
      try {
        const { agentId, chainId } = args;
        const agentIdBigInt = BigInt(agentId);
        const processedChains: string[] = [];

        // Get environment variables for RPC URLs and registry addresses
        const ethSepoliaRpc = env?.ETH_SEPOLIA_RPC_URL || env?.ETH_SEPOLIA_RPC_HTTP_URL;
        const baseSepoliaRpc = env?.BASE_SEPOLIA_RPC_URL || env?.BASE_SEPOLIA_RPC_HTTP_URL;
        const opSepoliaRpc = env?.OP_SEPOLIA_RPC_URL || env?.OP_SEPOLIA_RPC_HTTP_URL;
        
        const ethSepoliaRegistry = env?.ETH_SEPOLIA_IDENTITY_REGISTRY;
        const baseSepoliaRegistry = env?.BASE_SEPOLIA_IDENTITY_REGISTRY;
        const opSepoliaRegistry = env?.OP_SEPOLIA_IDENTITY_REGISTRY;

        // Import ethers and ERC8004Client dynamically
        const { ethers } = await import('ethers');
        const { ERC8004Client, EthersAdapter } = await import('@erc8004/sdk');

        // Initialize ERC8004 clients for each chain
        const chainsToProcess: Array<{ name: string; provider: any; client: any; chainId: number }> = [];

        if (ethSepoliaRpc && ethSepoliaRegistry) {
          if (chainId === undefined || chainId === 11155111) {
            const provider = new ethers.JsonRpcProvider(ethSepoliaRpc);
            const adapter = new EthersAdapter(provider);
            const client = new ERC8004Client({
              adapter,
              addresses: {
                identityRegistry: ethSepoliaRegistry,
                reputationRegistry: '0x0000000000000000000000000000000000000000',
                validationRegistry: '0x0000000000000000000000000000000000000000',
                chainId: 11155111,
              }
            });
            chainsToProcess.push({ name: 'ETH Sepolia', provider, client, chainId: 11155111 });
          }
        }

        if (baseSepoliaRpc && baseSepoliaRegistry) {
          if (chainId === undefined || chainId === 84532) {
            const provider = new ethers.JsonRpcProvider(baseSepoliaRpc);
            const adapter = new EthersAdapter(provider);
            const client = new ERC8004Client({
              adapter,
              addresses: {
                identityRegistry: baseSepoliaRegistry,
                reputationRegistry: '0x0000000000000000000000000000000000000000',
                validationRegistry: '0x0000000000000000000000000000000000000000',
                chainId: 84532,
              }
            });
            chainsToProcess.push({ name: 'Base Sepolia', provider, client, chainId: 84532 });
          }
        }

        if (opSepoliaRpc && opSepoliaRegistry) {
          if (chainId === undefined || chainId === 11155420) {
            const provider = new ethers.JsonRpcProvider(opSepoliaRpc);
            const adapter = new EthersAdapter(provider);
            const client = new ERC8004Client({
              adapter,
              addresses: {
                identityRegistry: opSepoliaRegistry,
                reputationRegistry: '0x0000000000000000000000000000000000000000',
                validationRegistry: '0x0000000000000000000000000000000000000000',
                chainId: 11155420,
              }
            });
            chainsToProcess.push({ name: 'Optimism Sepolia', provider, client, chainId: 11155420 });
          }
        }

        // Process each chain
        for (const { name, provider, client, chainId: cId } of chainsToProcess) {
          try {
            // Check if agent exists by trying to get owner
            const owner = await client.identity.getOwner(agentIdBigInt);
            const tokenURI = await client.identity.getTokenURI(agentIdBigInt).catch(() => null);
            
            // Get current block number
            let blockNumber = 0n;
            try {
              const block = await provider.getBlockNumber();
              blockNumber = BigInt(block);
            } catch {
              blockNumber = 0n;
            }
            
            if (owner && owner !== '0x0000000000000000000000000000000000000000') {
              // Process agent directly
              await processAgentDirectly(owner.toLowerCase(), agentIdBigInt, blockNumber, tokenURI, cId, db);
              processedChains.push(name);
            }
          } catch (error: any) {
            console.log(`⚠️ Agent ${agentId} not found on ${name}: ${error?.message || error}`);
          }
        }

        return {
          success: processedChains.length > 0,
          message: processedChains.length > 0
            ? `Successfully indexed agent ${agentId} on ${processedChains.join(', ')}`
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
    },
  };
}

// GraphQL Schema (same as graphql.ts)
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

// GraphiQL HTML template
const graphiqlHTML = `<!DOCTYPE html>
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
      
      // GraphiQL fetcher that reads headers from the header editor
      // We'll access the header editor DOM element directly since GraphiQL v3 CDN version
      // doesn't pass headers to the fetcher reliably
      const graphQLFetcher = async (graphQLParams) => {
        const requestHeaders = {
          'Content-Type': 'application/json'
        };
        
        // Try multiple methods to get headers from GraphiQL
        try {
          // Method 1: Check global store
          if (window.graphiqlHeaders && Object.keys(window.graphiqlHeaders).length > 0) {
            Object.assign(requestHeaders, window.graphiqlHeaders);
            console.log('📤 Using headers from global store:', window.graphiqlHeaders);
          }
          
          // Method 2: Try to read from header editor DOM element directly
          const headerSelectors = [
            'textarea[aria-label*="header" i]',
            'textarea[placeholder*="header" i]',
            '.graphiql-headers-editor textarea',
            '.graphiql-editor[aria-label*="header" i]',
            '[data-name="headers"]',
            '#graphiql-headers',
            'textarea'
          ];
          
          for (const selector of headerSelectors) {
            const headerEditor = document.querySelector(selector);
            if (headerEditor && headerEditor.value && headerEditor.value.trim()) {
              try {
                const headerText = headerEditor.value.trim();
                const parsedHeaders = JSON.parse(headerText);
                if (parsedHeaders && typeof parsedHeaders === 'object') {
                  Object.assign(requestHeaders, parsedHeaders);
                  console.log('📤 Using headers from editor element:', parsedHeaders);
                  break;
                }
              } catch (e) {
                // Not valid JSON, try next selector
              }
            }
          }
          
          // Method 3: Check all localStorage keys for GraphiQL headers
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.toLowerCase().includes('graphiql') && key.toLowerCase().includes('header')) {
              try {
                const savedHeaders = localStorage.getItem(key);
                if (savedHeaders) {
                  const parsedHeaders = JSON.parse(savedHeaders);
                  if (parsedHeaders && typeof parsedHeaders === 'object') {
                    Object.assign(requestHeaders, parsedHeaders);
                    console.log('📤 Using headers from localStorage:', key, parsedHeaders);
                    break;
                  }
                }
              } catch (e) {
                // Not valid JSON, continue
              }
            }
          }
          
          // Method 4: Try common GraphiQL localStorage keys
          const commonKeys = [
            'graphiql:headers',
            'graphiql-headers', 
            'graphiql.headers',
            'graphiql-headers-v3',
            'graphiql@3:headers'
          ];
          for (const key of commonKeys) {
            const savedHeaders = localStorage.getItem(key);
            if (savedHeaders) {
              try {
                const parsedHeaders = JSON.parse(savedHeaders);
                if (parsedHeaders && typeof parsedHeaders === 'object') {
                  Object.assign(requestHeaders, parsedHeaders);
                  console.log('📤 Using headers from localStorage key:', key, parsedHeaders);
                  break;
                }
              } catch (e) {
                // Not valid JSON, try next key
              }
            }
          }
        } catch (e) {
          console.error('Error extracting headers:', e);
        }
        
        console.log('📤 Final request headers being sent:', requestHeaders);
        
        // GraphiQL passes params as { query, variables?, operationName? }
        const query = graphQLParams.query || '';
        const variables = graphQLParams.variables || {};
        const operationName = graphQLParams.operationName || '';
        
        if (!query || typeof query !== 'string' || !query.trim()) {
          return Promise.resolve({
            errors: [{ message: 'Query string is required' }]
          });
        }
        
        return fetch('/graphql', {
          method: 'post',
          headers: requestHeaders,
          body: JSON.stringify({ query, variables, operationName }),
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
      
      // Create GraphiQL with header editor enabled
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
                return; // Exit the loop once we've set it
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
</html>`;

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface Env {
  DB: any; // D1Database type will be available at runtime
  GRAPHQL_SECRET_ACCESS_CODE?: string; // Secret access code for server-to-server authentication
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: { waitUntil?: (promise: Promise<any>) => void }
  ): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Handle GraphiQL
    if (url.pathname === '/graphiql' && request.method === 'GET') {
      return new Response(graphiqlHTML, {
        headers: { 
          'Content-Type': 'text/html',
          ...corsHeaders,
        },
      });
    }

    // Handle health check
    if (url.pathname === '/health' && request.method === 'GET') {
      return Response.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        environment: 'cloudflare-workers'
      }, {
        headers: corsHeaders,
      });
    }

    // Handle GraphQL queries
    if (url.pathname === '/graphql' || url.pathname === '/') {
      try {
        // Parse request body first to check operation
        let body: any = null;
        let query: string = '';
        
        if (request.method === 'POST') {
          body = await request.json();
          query = body.query || '';
        } else if (request.method === 'GET' && url.searchParams.get('query')) {
          query = url.searchParams.get('query') || '';
        }
        
        // Check if this is an access code operation or indexAgent (skip auth)
        // Also check operationName if provided
        const operationName = body?.operationName || '';
        const queryString = (query || '').toString();
        const isAccessCodeOperation = 
          operationName === 'getAccessCode' || 
          operationName === 'createAccessCode' ||
          (typeof queryString === 'string' && queryString.includes('getAccessCode')) || 
          (typeof queryString === 'string' && queryString.includes('createAccessCode'));
        const isIndexAgentOperation = 
          operationName === 'indexAgent' ||
          (typeof queryString === 'string' && queryString.includes('indexAgent'));
        
        if (!isAccessCodeOperation && !isIndexAgentOperation) {
          // Require access code authentication
          const authHeader = request.headers.get('authorization') || '';
          const accessCode = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7).trim() 
            : authHeader.trim();

          if (!accessCode) {
            return Response.json(
              { errors: [{ message: 'Access code required. Please provide Authorization header with your access code.' }] },
              { status: 401, headers: corsHeaders }
            );
          }

          // Check secret access code from environment variable (for server-to-server)
          const secretAccessCode = env.GRAPHQL_SECRET_ACCESS_CODE;
          if (secretAccessCode && accessCode === secretAccessCode) {
            // Secret access code is valid, continue
            console.log('[Auth] Validated secret access code');
          } else {
            // Validate regular user access code
            const isValid = await validateAccessCode(env.DB, accessCode);
            if (!isValid) {
              console.log(`[Auth] Invalid access code. Secret code configured: ${!!secretAccessCode}, Received code length: ${accessCode.length}`);
              return Response.json(
                { errors: [{ message: 'Invalid access code. Please get your access code via the createAccessCode mutation.' }] },
                { status: 401, headers: corsHeaders }
              );
            }
            console.log('[Auth] Validated user access code');
          }
        }
        
        if (request.method === 'GET' && url.searchParams.get('query')) {
          // Handle GET request with query parameter
          const variables = url.searchParams.get('variables') 
            ? JSON.parse(url.searchParams.get('variables')!) 
            : {};

          const dbQueries = createDBQueries(env.DB, env);
          const result = await graphql({
            schema,
            source: query,
            rootValue: dbQueries,
            variableValues: variables,
          });

          return Response.json(result, { headers: corsHeaders });
        } else if (request.method === 'POST') {
          // Handle POST request with JSON body
          const { variables = {} } = body;

          if (!query) {
            return Response.json(
              { errors: [{ message: 'Query is required' }] },
              { status: 400, headers: corsHeaders }
            );
          }

          const dbQueries = createDBQueries(env.DB, env);
          const result = await graphql({
            schema,
            source: query,
            rootValue: dbQueries,
            variableValues: variables,
          });

          return Response.json(result, { headers: corsHeaders });
        } else if (request.method === 'GET') {
          // Return GraphiQL UI for GET requests to /graphql (no query param)
          // This allows users to access GraphiQL directly at /graphql
          return new Response(graphiqlHTML, {
            headers: { 
              'Content-Type': 'text/html',
              ...corsHeaders,
            },
          });
        }
      } catch (error) {
        console.error('GraphQL error:', error);
        return Response.json(
          { 
            errors: [{ 
              message: error instanceof Error ? error.message : 'Internal server error' 
            }] 
          },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response('Not Found', { 
      status: 404,
      headers: corsHeaders,
    });
  },
};

