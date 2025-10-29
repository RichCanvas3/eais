/**
 * Cloudflare Workers entry point for ERC8004 Indexer GraphQL API
 */

import { graphql, type GraphQLSchema } from 'graphql';
import { buildSchema } from 'graphql';

// Import database query functions
import { createDBQueries } from './worker-db.js';

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

  type Query {
    agents(
      chainId: Int
      agentId: String
      agentOwner: String
      agentName: String
      limit: Int
      offset: Int
    ): [Agent!]!
    
    agent(chainId: Int!, agentId: String!): Agent
    
    agentsByChain(chainId: Int!, limit: Int, offset: Int): [Agent!]!
    
    agentsByOwner(agentOwner: String!, chainId: Int, limit: Int, offset: Int): [Agent!]!
    
    searchAgents(query: String!, chainId: Int, limit: Int, offset: Int): [Agent!]!
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
      const graphQLFetcher = graphQLParams =>
        fetch('/graphql', {
          method: 'post',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(graphQLParams),
        }).then(response => response.json());
      
      ReactDOM.render(
        React.createElement(GraphiQL, { 
          fetcher: graphQLFetcher,
          defaultQuery: \`query {
  agentsByChain(chainId: 11155111, limit: 10) {
    agentId
    agentName
    agentAddress
    description
    a2aEndpoint
  }
}\`
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
        if (request.method === 'GET' && url.searchParams.get('query')) {
          // Handle GET request with query parameter
          const query = url.searchParams.get('query') || '';
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
          const body = await request.json();
          const { query, variables = {} } = body;

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
          // Return GraphiQL for GET requests to /graphql
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

