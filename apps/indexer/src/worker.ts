/**
 * Cloudflare Workers entry point for ERC8004 Indexer GraphQL API
 */

import { graphql, type GraphQLSchema } from 'graphql';
import { buildSchema } from 'graphql';

// Import database query functions
import { createDBQueries, validateAccessCode } from './worker-db.js';

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
      
      // Create GraphiQL with header editor enabled
      ReactDOM.render(
        React.createElement(GraphiQL, { 
          fetcher: graphQLFetcher,
          defaultQuery: 


query {
  agentsByChain(chainId: 11155111, limit: 10) {
    agentId
    agentName
    agentAddress
    description
    a2aEndpoint
  }
}\`,
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

          const dbQueries = createDBQueries(env.DB);
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

          const dbQueries = createDBQueries(env.DB);
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

