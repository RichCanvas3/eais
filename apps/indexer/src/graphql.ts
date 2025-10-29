import { createHandler } from 'graphql-http/lib/use/express';
import { buildSchema, GraphQLSchema } from 'graphql';
import express from 'express';
import { db } from './db';

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

// Helper function to parse JSON fields
function parseJsonField<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

// Helper function to build WHERE clause dynamically
function buildWhereClause(filters: {
  chainId?: number;
  agentId?: string;
  agentOwner?: string;
  agentName?: string;
}): { where: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters.chainId !== undefined) {
    conditions.push(`chainId = ?`);
    params.push(filters.chainId);
  }

  if (filters.agentId) {
    conditions.push(`agentId = ?`);
    params.push(filters.agentId);
  }

  if (filters.agentOwner) {
    conditions.push(`agentOwner = ?`);
    params.push(filters.agentOwner);
  }

  if (filters.agentName) {
    conditions.push(`agentName LIKE ?`);
    params.push(`%${filters.agentName}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

const root = {
  agents: (args: {
    chainId?: number;
    agentId?: string;
    agentOwner?: string;
    agentName?: string;
    limit?: number;
    offset?: number;
  }) => {
    const { chainId, agentId, agentOwner, agentName, limit = 100, offset = 0 } = args;
    const { where, params } = buildWhereClause({ chainId, agentId, agentOwner, agentName });
    
    const query = `SELECT * FROM agents ${where} ORDER BY createdAtTime DESC LIMIT ? OFFSET ?`;
    const allParams = [...params, limit, offset];
    
    const rows = db.prepare(query).all(...allParams) as any[];
    return rows;
  },

  agent: (args: { chainId: number; agentId: string }) => {
    const { chainId, agentId } = args;
    const row = db.prepare('SELECT * FROM agents WHERE chainId = ? AND agentId = ?').get(chainId, agentId) as any;
    return row || null;
  },

  agentsByChain: (args: { chainId: number; limit?: number; offset?: number }) => {
    const { chainId, limit = 100, offset = 0 } = args;
    const rows = db
      .prepare('SELECT * FROM agents WHERE chainId = ? ORDER BY createdAtTime DESC LIMIT ? OFFSET ?')
      .all(chainId, limit, offset) as any[];
    return rows;
  },

  agentsByOwner: (args: { agentOwner: string; chainId?: number; limit?: number; offset?: number }) => {
    const { agentOwner, chainId, limit = 100, offset = 0 } = args;
    
    let query = 'SELECT * FROM agents WHERE agentOwner = ?';
    const params: any[] = [agentOwner];
    
    if (chainId !== undefined) {
      query += ' AND chainId = ?';
      params.push(chainId);
    }
    
    query += ' ORDER BY createdAtTime DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = db.prepare(query).all(...params) as any[];
    return rows;
  },

  searchAgents: (args: { query: string; chainId?: number; limit?: number; offset?: number }) => {
    const { query: searchQuery, chainId, limit = 100, offset = 0 } = args;
    const searchPattern = `%${searchQuery}%`;
    
    let sqlQuery = `
      SELECT * FROM agents 
      WHERE (agentName LIKE ? OR description LIKE ? OR agentId LIKE ? OR agentAddress LIKE ?)
    `;
    const params: any[] = [searchPattern, searchPattern, searchPattern, searchPattern];
    
    if (chainId !== undefined) {
      sqlQuery += ' AND chainId = ?';
      params.push(chainId);
    }
    
    sqlQuery += ' ORDER BY createdAtTime DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const rows = db.prepare(sqlQuery).all(...params) as any[];
    return rows;
  },
};

// Create GraphQL handler
const handler = createHandler({
  schema: schema as GraphQLSchema,
  rootValue: root,
  context: () => ({}),
});

export function createGraphQLServer(port: number = 4000) {
  const app = express();

  app.use(express.json());

  // GraphQL endpoint
  app.all('/graphql', handler);

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Simple GraphiQL endpoint (basic HTML page)
  app.get('/graphiql', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>GraphiQL</title>
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
      </html>
    `);
  });

  const server = app.listen(port, () => {
    console.log(`🚀 GraphQL server running at http://localhost:${port}/graphql`);
    console.log(`📊 GraphiQL playground available at http://localhost:${port}/graphiql`);
  });

  return server;
}

