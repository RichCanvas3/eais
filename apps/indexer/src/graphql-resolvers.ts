/**
 * Shared GraphQL resolvers that work with both D1 adapter and native D1
 * This module abstracts the database interface differences
 */

/**
 * Helper to normalize database results
 * - D1 adapter: returns array directly
 * - Native D1: returns object with .results property
 */
function normalizeResults(result: any): any[] {
  if (Array.isArray(result)) {
    return result;
  }
  if (result?.results && Array.isArray(result.results)) {
    return result.results;
  }
  return [];
}

/**
 * Helper to normalize a single result
 */
function normalizeResult(result: any): any | null {
  if (result && !Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result) && result.length > 0) {
    return result[0];
  }
  return null;
}

/**
 * Unified database query executor that works with both D1 adapter and native D1
 * - D1 adapter: db.prepare(sql).all(...params) or db.prepare(sql).get(...params)
 * - Native D1: db.prepare(sql).bind(...params).all() or db.prepare(sql).bind(...params).first()
 */
async function executeQuery(db: any, sql: string, params: any[]): Promise<any[]> {
  const stmt = db.prepare(sql);
  
  // Check if it's native D1 (has .bind method)
  if (stmt.bind && typeof stmt.bind === 'function') {
    // Native D1: use .bind().all()
    const result = await stmt.bind(...params).all();
    return normalizeResults(result);
  } else {
    // D1 adapter: use .all(...params)
    const result = await stmt.all(...params);
    return normalizeResults(result);
  }
}

/**
 * Unified database query executor for single row
 */
async function executeQuerySingle(db: any, sql: string, params: any[]): Promise<any | null> {
  const stmt = db.prepare(sql);
  
  // Check if it's native D1 (has .bind method)
  if (stmt.bind && typeof stmt.bind === 'function') {
    // Native D1: use .bind().first()
    const result = await stmt.bind(...params).first();
    return normalizeResult(result);
  } else {
    // D1 adapter: use .get(...params)
    const result = await stmt.get(...params);
    return normalizeResult(result);
  }
}

/**
 * Unified database execute (for INSERT, UPDATE, DELETE)
 */
async function executeUpdate(db: any, sql: string, params: any[]): Promise<void> {
  const stmt = db.prepare(sql);
  
  // Check if it's native D1 (has .bind method)
  if (stmt.bind && typeof stmt.bind === 'function') {
    // Native D1: use .bind().run()
    await stmt.bind(...params).run();
  } else {
    // D1 adapter: use .run(...params)
    await stmt.run(...params);
  }
}

/**
 * Helper function to build WHERE clause dynamically
 */
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

/**
 * Helper function to build ORDER BY clause
 */
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

/**
 * Build WHERE clause using The Graph-style where input
 */
function buildGraphWhereClause(where?: {
  chainId?: number;
  chainId_in?: number[];
  agentId?: string;
  agentId_in?: string[];
  agentOwner?: string;
  agentOwner_in?: string[];
  agentName_contains?: string;
  agentName_contains_nocase?: string;
  agentName_starts_with?: string;
  agentName_starts_with_nocase?: string;
  agentName_ends_with?: string;
  agentName_ends_with_nocase?: string;
  description_contains?: string;
  description_contains_nocase?: string;
  ensEndpoint_contains?: string;
  ensEndpoint_contains_nocase?: string;
  agentAccountEndpoint_contains?: string;
  agentAccountEndpoint_contains_nocase?: string;
  did?: string;
  did_contains?: string;
  did_contains_nocase?: string;
  createdAtTime_gt?: number;
  createdAtTime_gte?: number;
  createdAtTime_lt?: number;
  createdAtTime_lte?: number;
  hasA2aEndpoint?: boolean;
  hasEnsEndpoint?: boolean;
  mcp?: boolean;
  x402support?: boolean;
  active?: boolean;
  operator_in?: string[];
  supportedTrust_in?: string[];
  a2aSkills_in?: string[];
  mcpTools_in?: string[];
  mcpPrompts_in?: string[];
  mcpResources_in?: string[];
}): { where: string; params: any[] } {
  if (!where) return { where: '', params: [] };
  const conditions: string[] = [];
  const params: any[] = [];

  // Equality / IN filters
  if (where.chainId !== undefined) {
    conditions.push(`chainId = ?`);
    params.push(where.chainId);
  }
  if (Array.isArray(where.chainId_in) && where.chainId_in.length > 0) {
    conditions.push(`chainId IN (${where.chainId_in.map(() => '?').join(',')})`);
    params.push(...where.chainId_in);
  }
  if (where.agentId) {
    conditions.push(`agentId = ?`);
    params.push(where.agentId);
  }
  if (Array.isArray(where.agentId_in) && where.agentId_in.length > 0) {
    conditions.push(`agentId IN (${where.agentId_in.map(() => '?').join(',')})`);
    params.push(...where.agentId_in);
  }
  if (where.agentOwner) {
    conditions.push(`agentOwner = ?`);
    params.push(where.agentOwner);
  }
  if (Array.isArray(where.agentOwner_in) && where.agentOwner_in.length > 0) {
    conditions.push(`agentOwner IN (${where.agentOwner_in.map(() => '?').join(',')})`);
    params.push(...where.agentOwner_in);
  }

  // Text filters - agentName
  if (where.agentName_contains) {
    conditions.push(`agentName LIKE ?`);
    params.push(`%${where.agentName_contains}%`);
  }
  if (where.agentName_contains_nocase) {
    conditions.push(`LOWER(agentName) LIKE LOWER(?)`);
    params.push(`%${where.agentName_contains_nocase}%`);
  }
  if (where.agentName_starts_with) {
    conditions.push(`agentName LIKE ?`);
    params.push(`${where.agentName_starts_with}%`);
  }
  if (where.agentName_starts_with_nocase) {
    conditions.push(`LOWER(agentName) LIKE LOWER(?)`);
    params.push(`${where.agentName_starts_with_nocase}%`);
  }
  if (where.agentName_ends_with) {
    conditions.push(`agentName LIKE ?`);
    params.push(`%${where.agentName_ends_with}`);
  }
  if (where.agentName_ends_with_nocase) {
    conditions.push(`LOWER(agentName) LIKE LOWER(?)`);
    params.push(`%${where.agentName_ends_with_nocase}`);
  }

  // Text filters - description
  if (where.description_contains) {
    conditions.push(`description LIKE ?`);
    params.push(`%${where.description_contains}%`);
  }
  if (where.description_contains_nocase) {
    conditions.push(`LOWER(description) LIKE LOWER(?)`);
    params.push(`%${where.description_contains_nocase}%`);
  }

  // Endpoints and DID
  if (where.ensEndpoint_contains) {
    conditions.push(`ensEndpoint LIKE ?`);
    params.push(`%${where.ensEndpoint_contains}%`);
  }
  if (where.ensEndpoint_contains_nocase) {
    conditions.push(`LOWER(ensEndpoint) LIKE LOWER(?)`);
    params.push(`%${where.ensEndpoint_contains_nocase}%`);
  }
  if (where.agentAccountEndpoint_contains) {
    conditions.push(`agentAccountEndpoint LIKE ?`);
    params.push(`%${where.agentAccountEndpoint_contains}%`);
  }
  if (where.agentAccountEndpoint_contains_nocase) {
    conditions.push(`LOWER(agentAccountEndpoint) LIKE LOWER(?)`);
    params.push(`%${where.agentAccountEndpoint_contains_nocase}%`);
  }
  if (where.did) {
    conditions.push(`did = ?`);
    params.push(where.did);
  }
  if (where.did_contains) {
    conditions.push(`did LIKE ?`);
    params.push(`%${where.did_contains}%`);
  }
  if (where.did_contains_nocase) {
    conditions.push(`LOWER(did) LIKE LOWER(?)`);
    params.push(`%${where.did_contains_nocase}%`);
  }

  // Numeric ranges
  if (where.createdAtTime_gt !== undefined) {
    conditions.push(`createdAtTime > ?`);
    params.push(where.createdAtTime_gt);
  }
  if (where.createdAtTime_gte !== undefined) {
    conditions.push(`createdAtTime >= ?`);
    params.push(where.createdAtTime_gte);
  }
  if (where.createdAtTime_lt !== undefined) {
    conditions.push(`createdAtTime < ?`);
    params.push(where.createdAtTime_lt);
  }
  if (where.createdAtTime_lte !== undefined) {
    conditions.push(`createdAtTime <= ?`);
    params.push(where.createdAtTime_lte);
  }

  // Presence checks
  if (where.hasA2aEndpoint === true) {
    conditions.push(`a2aEndpoint IS NOT NULL AND a2aEndpoint != ''`);
  } else if (where.hasA2aEndpoint === false) {
    conditions.push(`(a2aEndpoint IS NULL OR a2aEndpoint = '')`);
  }
  if (where.hasEnsEndpoint === true) {
    conditions.push(`ensEndpoint IS NOT NULL AND ensEndpoint != ''`);
  } else if (where.hasEnsEndpoint === false) {
    conditions.push(`(ensEndpoint IS NULL OR ensEndpoint = '')`);
  }

  // Boolean flags
  if (where.mcp === true) {
    conditions.push(`mcp = 1`);
  } else if (where.mcp === false) {
    conditions.push(`(mcp IS NULL OR mcp = 0)`);
  }
  if (where.x402support === true) {
    conditions.push(`x402support = 1`);
  } else if (where.x402support === false) {
    conditions.push(`(x402support IS NULL OR x402support = 0)`);
  }
  if (where.active === true) {
    conditions.push(`active = 1`);
  } else if (where.active === false) {
    conditions.push(`(active IS NULL OR active = 0)`);
  }

  // Membership filters using EXISTS subqueries
  const addExistsFilter = (table: string, column: string, values?: string[]) => {
    if (Array.isArray(values) && values.length > 0) {
      const placeholders = values.map(() => '?').join(',');
      conditions.push(`EXISTS (SELECT 1 FROM ${table} t WHERE t.chainId = agents.chainId AND t.agentId = agents.agentId AND t.${column} IN (${placeholders}))`);
      params.push(...values);
    }
  };
  addExistsFilter('agent_operators', 'operator', where.operator_in);
  addExistsFilter('agent_supported_trust', 'trust', where.supportedTrust_in);
  addExistsFilter('agent_skills', 'skill', where.a2aSkills_in);
  addExistsFilter('agent_mcp_tools', 'tool', where.mcpTools_in);
  addExistsFilter('agent_mcp_prompts', 'prompt', where.mcpPrompts_in);
  addExistsFilter('agent_mcp_resources', 'resource', where.mcpResources_in);

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where: whereSql, params };
}

/**
 * Create GraphQL resolvers
 * @param db - Database instance (can be D1 adapter or native D1)
 * @param options - Additional options (like env for indexAgent)
 */
export function createGraphQLResolvers(db: any, options?: { env?: any }) {

  return {
    agents: async (args: {
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
        const { where, params } = buildWhereClause({ chainId, agentId, agentOwner, agentName });
        const orderByClause = buildOrderByClause(orderBy, orderDirection);
        const query = `SELECT * FROM agents ${where} ${orderByClause} LIMIT ? OFFSET ?`;
        const allParams = [...params, limit, offset];
        return await executeQuery(db, query, allParams);
      } catch (error) {
        console.error('❌ Error in agents resolver:', error);
        throw error;
      }
    },

    // Graph-like advanced search (where/first/skip/orderBy/orderDirection)
    searchAgentsGraph: async (args: {
      where?: any;
      first?: number;
      skip?: number;
      orderBy?: string;
      orderDirection?: string;
    }) => {
      try {
        const { where, first = 20, skip = 0, orderBy, orderDirection } = args || {};
        const { where: whereSql, params } = buildGraphWhereClause(where);
        const orderByClause = buildOrderByClause(orderBy, orderDirection);

        const agentsQuery = `SELECT * FROM agents ${whereSql} ${orderByClause} LIMIT ? OFFSET ?`;
        const agentsParams = [...params, first, skip];
        const agents = await executeQuery(db, agentsQuery, agentsParams);

        const countQuery = `SELECT COUNT(*) as count FROM agents ${whereSql}`;
        const countResult = await executeQuerySingle(db, countQuery, params);
        const total = (countResult as any)?.count || 0;
        const hasMore = (skip + first) < total;

        return { agents, total, hasMore };
      } catch (error) {
        console.error('❌ Error in searchAgentsGraph resolver:', error);
        throw error;
      }
    },

    agent: async (args: { chainId: number; agentId: string }) => {
      try {
        const { chainId, agentId } = args;
        return await executeQuerySingle(db, 'SELECT * FROM agents WHERE chainId = ? AND agentId = ?', [chainId, agentId]);
      } catch (error) {
        console.error('❌ Error in agent resolver:', error);
        throw error;
      }
    },

    agentByName: async (args: { agentName: string }) => {
      try {
        console.log('🔍 agentByName resolver:', args);
        const normalizedName = args.agentName?.trim();
        if (!normalizedName) {
          return null;
        }
        const lowerName = normalizedName.toLowerCase();
        console.log('🔍 lowerName:', lowerName);
        const result = await executeQuerySingle(db, 'SELECT * FROM agents WHERE LOWER(agentName) = ? LIMIT 1', [lowerName]);
        console.log('🔍 result:', JSON.stringify(result, null, 2)); 
        return result;
      } catch (error) {
        console.error('❌ Error in agentByName resolver:', error);
        throw error;
      }
    },

    agentsByChain: async (args: { chainId: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
      try {
        const { chainId, limit = 100, offset = 0, orderBy, orderDirection } = args;
        const orderByClause = buildOrderByClause(orderBy, orderDirection);
        const query = `SELECT * FROM agents WHERE chainId = ? ${orderByClause} LIMIT ? OFFSET ?`;
        return await executeQuery(db, query, [chainId, limit, offset]);
      } catch (error) {
        console.error('❌ Error in agentsByChain resolver:', error);
        throw error;
      }
    },

    agentsByOwner: async (args: { agentOwner: string; chainId?: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
      try {
        const { agentOwner, chainId, limit = 100, offset = 0, orderBy, orderDirection } = args;
        let query = 'SELECT * FROM agents WHERE agentOwner = ?';
        const params: any[] = [agentOwner];
        
        if (chainId !== undefined) {
          query += ' AND chainId = ?';
          params.push(chainId);
        }
        
        const orderByClause = buildOrderByClause(orderBy, orderDirection);
        query += ` ${orderByClause} LIMIT ? OFFSET ?`;
        params.push(limit, offset);
        
        return await executeQuery(db, query, params);
      } catch (error) {
        console.error('❌ Error in agentsByOwner resolver:', error);
        throw error;
      }
    },

    searchAgents: async (args: { query: string; chainId?: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
      try {
        const { query: searchQuery, chainId, limit = 100, offset = 0, orderBy, orderDirection } = args;
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

        return await executeQuery(db, sqlQuery, params);
      } catch (error) {
        console.error('❌ Error in searchAgents resolver:', error);
        throw error;
      }
    },

    getAccessCode: async (args: { address: string }) => {
      try {
        const { address } = args;
        return await executeQuerySingle(db, 'SELECT * FROM access_codes WHERE address = ?', [address.toLowerCase()]);
      } catch (error) {
        console.error('❌ Error in getAccessCode resolver:', error);
        throw error;
      }
    },

    countAgents: async (args: {
      chainId?: number;
      agentId?: string;
      agentOwner?: string;
      agentName?: string;
    }) => {
      try {
        const { where, params } = buildWhereClause(args);
        const query = `SELECT COUNT(*) as count FROM agents ${where}`;
        const result = await executeQuerySingle(db, query, params);
        return (result as any)?.count || 0;
      } catch (error) {
        console.error('❌ Error in countAgents resolver:', error);
        throw error;
      }
    },

    createAccessCode: async (args: { address: string }) => {
      try {
        const { address } = args;
        const normalizedAddress = address.toLowerCase();
        
        // Check if access code already exists
        const existing = await executeQuerySingle(db, 'SELECT * FROM access_codes WHERE address = ?', [normalizedAddress]);
        
        if (existing) {
          return existing;
        }
        
        // Generate new access code (32 bytes = 64 hex characters)
        // Use crypto.randomUUID if available, otherwise fallback
        let accessCode: string;
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
          accessCode = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        } else {
          // Fallback for Node.js crypto module
          const cryptoNode = await import('crypto');
          accessCode = cryptoNode.randomBytes(32).toString('hex');
        }
        const timestamp = Math.floor(Date.now() / 1000);
        
        // Insert new access code
        await executeUpdate(db, 'INSERT INTO access_codes (address, accessCode, createdAt) VALUES (?, ?, ?)', [
          normalizedAddress,
          accessCode,
          timestamp,
        ]);
        
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

    // indexAgent will be added by the specific implementation (graphql.ts or worker-db.ts)
    // because it needs environment-specific logic
  };
}

/**
 * Unified validateAccessCode function that works with both D1 adapter and native D1
 */
export async function validateAccessCode(db: any, accessCode: string | null | undefined): Promise<boolean> {
  if (!accessCode) return false;
  try {
    // Use executeQuerySingle to handle both database interfaces
    const row = await executeQuerySingle(db, 'SELECT accessCode FROM access_codes WHERE accessCode = ?', [accessCode]);
    
    if (row) {
      // Update lastUsedAt
      const timestamp = Math.floor(Date.now() / 1000);
      await executeUpdate(db, 'UPDATE access_codes SET lastUsedAt = ? WHERE accessCode = ?', [timestamp, accessCode]);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error validating access code:', error);
    return false;
  }
}

