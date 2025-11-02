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

    agent: async (args: { chainId: number; agentId: string }) => {
      try {
        const { chainId, agentId } = args;
        return await executeQuerySingle(db, 'SELECT * FROM agents WHERE chainId = ? AND agentId = ?', [chainId, agentId]);
      } catch (error) {
        console.error('❌ Error in agent resolver:', error);
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

