import { createHandler } from 'graphql-http/lib/use/express';
import { buildSchema, GraphQLSchema } from 'graphql';
import express from 'express';
import { db, formatSQLTimestamp } from './db';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { ERC8004Client, EthersAdapter } from '@erc8004/sdk';
import { 
  ETH_SEPOLIA_IDENTITY_REGISTRY, 
  BASE_SEPOLIA_IDENTITY_REGISTRY, 
  OP_SEPOLIA_IDENTITY_REGISTRY,
  ETH_SEPOLIA_RPC_HTTP_URL, 
  BASE_SEPOLIA_RPC_HTTP_URL,
  OP_SEPOLIA_RPC_HTTP_URL 
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

// Helper function to build ORDER BY clause
function buildOrderByClause(orderBy?: string, orderDirection?: string): string {
  // Valid columns for ordering
  const validColumns = ['agentId', 'agentName', 'createdAtTime', 'createdAtBlock', 'agentOwner'];
  
  // Default to agentId ASC if not specified
  const column = orderBy && validColumns.includes(orderBy) ? orderBy : 'agentId';
  const direction = (orderDirection?.toUpperCase() === 'DESC') ? 'DESC' : 'ASC';
  
  // Cast agentId to integer for proper numeric sorting
  const orderColumn = column === 'agentId' ? 'CAST(agentId AS INTEGER)' : column;
  
  return `ORDER BY ${orderColumn} ${direction}`;
}

// Helper function to generate a secure access code
function generateAccessCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

// Helper function to validate access code
async function validateAccessCode(accessCode: string | null | undefined): Promise<boolean> {
  if (!accessCode) return false;
  try {
    const row = await db.prepare('SELECT accessCode FROM access_codes WHERE accessCode = ?').get(accessCode) as { accessCode?: string } | undefined;
    if (row) {
      // Update lastUsedAt
      const timestamp = Math.floor(Date.now() / 1000);
      await db.prepare('UPDATE access_codes SET lastUsedAt = ? WHERE accessCode = ?').run(timestamp, accessCode);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error validating access code:', error);
    return false;
  }
}

const root = {
  agents: (args: {
    chainId?: number;
    agentId?: string;
    agentOwner?: string;
    agentName?: string;
    limit?: number;
    offset?: number;
    orderBy?: string;
    orderDirection?: string;
  }) => {
    try {
      const { chainId, agentId, agentOwner, agentName, limit = 100, offset = 0, orderBy, orderDirection } = args;
      console.log('🔍 agents resolver called with args:', { chainId, agentId, agentOwner, agentName, limit, offset, orderBy, orderDirection });
      
    const { where, params } = buildWhereClause({ chainId, agentId, agentOwner, agentName });
      const orderByClause = buildOrderByClause(orderBy, orderDirection);
    
      console.log('📋 SQL orderByClause:', orderByClause);
      const query = `SELECT * FROM agents ${where} ${orderByClause} LIMIT ? OFFSET ?`;
    const allParams = [...params, limit, offset];
      
      console.log('🔎 Executing SQL:', query);
      console.log('📊 SQL params:', allParams);
    
    const rows = db.prepare(query).all(...allParams) as any[];
 
      console.log(`✅ agents resolver returning ${rows.length} rows`);
    return rows;
    } catch (error) {
      console.error('❌ Error in agents resolver:', error);
      throw error;
    }
  },

  agent: (args: { chainId: number; agentId: string }) => {
    const { chainId, agentId } = args;
    const row = db.prepare('SELECT * FROM agents WHERE chainId = ? AND agentId = ?').get(chainId, agentId) as any;
    return row || null;
  },

  agentsByChain: (args: { chainId: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
    try {
      const { chainId, limit = 100, offset = 0, orderBy, orderDirection } = args;
      console.log('📋 agentsByChain resolver called with args:', args);
      
      const orderByClause = buildOrderByClause(orderBy, orderDirection);
      const query = `SELECT * FROM agents WHERE chainId = ? ${orderByClause} LIMIT ? OFFSET ?`;
      
      console.log('🔎 Executing SQL:', query);
      console.log('📊 SQL params:', [chainId, limit, offset]);
      
      const rows = db.prepare(query).all(chainId, limit, offset) as any[];
      console.log(`✅ agentsByChain resolver returning ${rows.length} rows`);
    return rows;
    } catch (error) {
      console.error('❌ Error in agentsByChain resolver:', error);
      throw error;
    }
  },

  agentsByOwner: (args: { agentOwner: string; chainId?: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
    try {
      const { agentOwner, chainId, limit = 100, offset = 0, orderBy, orderDirection } = args;
      console.log('📋 agentsByOwner resolver called with args:', args);
    
    let query = 'SELECT * FROM agents WHERE agentOwner = ?';
    const params: any[] = [agentOwner];
    
    if (chainId !== undefined) {
      query += ' AND chainId = ?';
      params.push(chainId);
    }
    
      const orderByClause = buildOrderByClause(orderBy, orderDirection);
      query += ` ${orderByClause} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
      
      console.log('🔎 Executing SQL:', query);
      console.log('📊 SQL params:', params);
    
    const rows = db.prepare(query).all(...params) as any[];
      console.log(`✅ agentsByOwner resolver returning ${rows.length} rows`);
    return rows;
    } catch (error) {
      console.error('❌ Error in agentsByOwner resolver:', error);
      throw error;
    }
  },

  searchAgents: (args: { query: string; chainId?: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
    try {
      const { query: searchQuery, chainId, limit = 100, offset = 0, orderBy, orderDirection } = args;
      console.log('📋 searchAgents resolver called with args:', args);
      
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
    
      const orderByClause = buildOrderByClause(orderBy, orderDirection);
      sqlQuery += ` ${orderByClause} LIMIT ? OFFSET ?`;
    params.push(limit, offset);
      
      console.log('🔎 Executing SQL:', sqlQuery);
      console.log('📊 SQL params:', params);
    
    const rows = db.prepare(sqlQuery).all(...params) as any[];
      console.log(`✅ searchAgents resolver returning ${rows.length} rows`);
    return rows;
    } catch (error) {
      console.error('❌ Error in searchAgents resolver:', error);
      throw error;
    }
  },

  getAccessCode: async (args: { address: string }) => {
    try {
      const { address } = args;
      const row = await db.prepare('SELECT * FROM access_codes WHERE address = ?').get(address.toLowerCase()) as any;
      return row || null;
    } catch (error) {
      console.error('❌ Error in getAccessCode resolver:', error);
      throw error;
    }
  },

  createAccessCode: async (args: { address: string }) => {
    try {
      const { address } = args;
      const normalizedAddress = address.toLowerCase();
      
      // Check if access code already exists
      let row = await db.prepare('SELECT * FROM access_codes WHERE address = ?').get(normalizedAddress) as any;
      
      if (row) {
        // Return existing access code
        return row;
      }
      
      // Generate new access code
      const accessCode = generateAccessCode();
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Insert new access code
      await db.prepare('INSERT INTO access_codes (address, accessCode, createdAt) VALUES (?, ?, ?)').run(
        normalizedAddress,
        accessCode,
        timestamp
      );
      
      return {
        address: normalizedAddress,
        accessCode,
        createdAt: timestamp,
      };
    } catch (error) {
      console.error('❌ Error in createAccessCode resolver:', error);
      throw error;
    }
  },

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
            await processAgentDirectly(owner.toLowerCase(), agentIdBigInt, blockNumber, tokenURI, cId);
            processedChains.push(name);
          }
        } catch (error: any) {
          console.log(`  ⚠️  Agent ${agentId} not found on ${name}: ${error?.message || error}`);
        }
      }

      return {
        success: processedChains.length > 0,
        message: processedChains.length > 0
          ? `Successfully indexed agent ${agentId} on ${processedChains.join(', ')}`
          : `Agent ${agentId} not found on any chain`,
        processedChains,
      };
    } catch (error: any) {
      console.error('❌ Error in indexAgent resolver:', error);
      throw error;
    }
  },
};

// Helper function to process an agent directly from chain (not from subgraph)
// This duplicates logic from indexer.ts but makes it accessible from GraphQL
async function processAgentDirectly(
  ownerAddress: string,
  tokenId: bigint,
  blockNumber: bigint,
  tokenURI: string | null,
  chainId: number
) {
  const agentId = tokenId.toString();
  const agentAddress = ownerAddress;
  let agentName = '';

  // Fetch metadata from tokenURI
  let preFetchedMetadata: any = null;
  let a2aEndpoint: string | null = null;
  
  if (tokenURI) {
    try {
      // Fetch from IPFS gateway
      const cidMatch = tokenURI.match(/ipfs:\/\/([a-z0-9]+)/i) || tokenURI.match(/https?:\/\/([a-z0-9]+)\.ipfs\.[^\/]*/i);
      if (cidMatch) {
        const cid = cidMatch[1];
        const ipfsUrl = `https://${cid}.ipfs.w3s.link`;
        const resp = await fetch(ipfsUrl);
        if (resp?.ok) {
          preFetchedMetadata = await resp.json();
          if (typeof preFetchedMetadata?.name === 'string' && preFetchedMetadata.name.trim()) {
            agentName = preFetchedMetadata.name.trim();
          }
          const endpoints = Array.isArray(preFetchedMetadata.endpoints) ? preFetchedMetadata.endpoints : [];
          const findEndpoint = (n: string) => {
            const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
            return e && typeof e.endpoint === 'string' ? e.endpoint : null;
          };
          a2aEndpoint = findEndpoint('A2A') || findEndpoint('a2a');
        }
      } else if (/^https?:\/\//i.test(tokenURI)) {
        const resp = await fetch(tokenURI);
        if (resp?.ok) {
          preFetchedMetadata = await resp.json();
          if (typeof preFetchedMetadata?.name === 'string' && preFetchedMetadata.name.trim()) {
            agentName = preFetchedMetadata.name.trim();
          }
          const endpoints = Array.isArray(preFetchedMetadata.endpoints) ? preFetchedMetadata.endpoints : [];
          const findEndpoint = (n: string) => {
            const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
            return e && typeof e.endpoint === 'string' ? e.endpoint : null;
          };
          a2aEndpoint = findEndpoint('A2A') || findEndpoint('a2a');
        }
      }
    } catch (e) {
      console.warn('Failed to fetch metadata:', e);
    }
  }

  if (ownerAddress !== '0x000000000000000000000000000000000000dEaD') {
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Insert or update agent
    await db.prepare(`
      INSERT INTO agents(chainId, agentId, agentAddress, agentOwner, agentName, metadataURI, a2aEndpoint, createdAtBlock, createdAtTime)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chainId, agentId) DO UPDATE SET
        agentAddress=CASE WHEN excluded.agentAddress IS NOT NULL AND excluded.agentAddress != '0x0000000000000000000000000000000000000000' THEN excluded.agentAddress ELSE agentAddress END,
        agentOwner=excluded.agentOwner,
        agentName=COALESCE(NULLIF(TRIM(excluded.agentName), ''), agentName),
        a2aEndpoint=COALESCE(excluded.a2aEndpoint, a2aEndpoint),
        metadataURI=COALESCE(excluded.metadataURI, metadataURI)
    `).run(
      chainId,
      agentId,
      agentAddress,
      ownerAddress,
      agentName,
      tokenURI,
      a2aEndpoint,
      Number(blockNumber),
      currentTime
    );

    // Update metadata fields if available
    if (preFetchedMetadata) {
      try {
        const meta = preFetchedMetadata;
        const type = typeof meta.type === 'string' ? meta.type : null;
        const name = typeof meta.name === 'string' ? meta.name : null;
        const description = typeof meta.description === 'string' ? meta.description : null;
        const image = meta.image == null ? null : String(meta.image);
        const endpoints = Array.isArray(meta.endpoints) ? meta.endpoints : [];
        const findEndpoint = (n: string) => {
          const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
          return e && typeof e.endpoint === 'string' ? e.endpoint : null;
        };
        const a2aEp = findEndpoint('A2A') || findEndpoint('a2a');
        const ensEndpoint = findEndpoint('ENS');
        let agentAccountEndpoint = findEndpoint('agentAccount');
        if (!agentAccountEndpoint || !/^eip155:/i.test(agentAccountEndpoint)) {
          agentAccountEndpoint = `eip155:${chainId}:${ownerAddress}`;
        }
        const supportedTrust = Array.isArray(meta.supportedTrust) ? meta.supportedTrust.map(String) : [];
        const updateTime = Math.floor(Date.now() / 1000);
        
        await db.prepare(`
          UPDATE agents SET
            type = COALESCE(type, ?),
            agentName = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE agentName 
            END,
            agentAddress = CASE
              WHEN (agentAddress IS NULL OR agentAddress = '0x0000000000000000000000000000000000000000')
                   AND (? IS NOT NULL AND ? != '0x0000000000000000000000000000000000000000')
              THEN ?
              ELSE agentAddress
            END,
            description = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE description 
            END,
            image = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE image 
            END,
            a2aEndpoint = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE a2aEndpoint 
            END,
            ensEndpoint = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE ensEndpoint 
            END,
            agentAccountEndpoint = COALESCE(?, agentAccountEndpoint),
            supportedTrust = COALESCE(?, supportedTrust),
            rawJson = COALESCE(?, rawJson),
            updatedAtTime = ?
          WHERE chainId = ? AND agentId = ?
        `).run(
          type,
          name, name, name,
          agentAddress, agentAddress, agentAddress,
          description, description, description,
          image, image, image,
          a2aEp, a2aEp, a2aEp,
          ensEndpoint, ensEndpoint, ensEndpoint,
          agentAccountEndpoint,
          JSON.stringify(supportedTrust),
          JSON.stringify(meta),
          updateTime,
          chainId,
          agentId,
        );
      } catch (error) {
        console.warn('Error updating metadata:', error);
      }
    }
  }
}

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

  const server = app.listen(port, () => {
    console.log(`🚀 GraphQL server running at http://localhost:${port}/graphql`);
    console.log(`📊 GraphiQL playground available at:`);
    console.log(`   - http://localhost:${port}/graphql (GET - GraphiQL UI)`);
    console.log(`   - http://localhost:${port}/graphiql (GET - GraphiQL UI, alternative)`);
  });

  return server;
}

