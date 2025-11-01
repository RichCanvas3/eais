/**
 * Database query functions for Cloudflare Workers (D1)
 * These replace the better-sqlite3 queries used in the local version
 */

export function createDBQueries(db: any) {
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
      const { chainId, agentId, agentOwner, agentName, limit = 100, offset = 0, orderBy, orderDirection } = args;
      const { where, params } = buildWhereClause({ chainId, agentId, agentOwner, agentName });
      const orderByClause = buildOrderByClause(orderBy, orderDirection);
      
      const query = `SELECT * FROM agents ${where} ${orderByClause} LIMIT ? OFFSET ?`;
      const allParams = [...params, limit, offset];
      
      const result = await db.prepare(query).bind(...allParams).all();
      return result.results || [];
    },

    agent: async (args: { chainId: number; agentId: string }) => {
      const { chainId, agentId } = args;
      const result = await db
        .prepare('SELECT * FROM agents WHERE chainId = ? AND agentId = ?')
        .bind(chainId, agentId)
        .first();
      return result || null;
    },

    agentsByChain: async (args: { chainId: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
      const { chainId, limit = 100, offset = 0, orderBy, orderDirection } = args;
      const orderByClause = buildOrderByClause(orderBy, orderDirection);
      const query = `SELECT * FROM agents WHERE chainId = ? ${orderByClause} LIMIT ? OFFSET ?`;
      
      const result = await db.prepare(query).bind(chainId, limit, offset).all();
      return result.results || [];
    },

    agentsByOwner: async (args: { agentOwner: string; chainId?: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
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
      
      const result = await db.prepare(query).bind(...params).all();
      return result.results || [];
    },

    searchAgents: async (args: { query: string; chainId?: number; limit?: number; offset?: number; orderBy?: string; orderDirection?: string }) => {
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
      
      const result = await db.prepare(sqlQuery).bind(...params).all();
      return result.results || [];
    },

    getAccessCode: async (args: { address: string }) => {
      const { address } = args;
      const result = await db
        .prepare('SELECT * FROM access_codes WHERE address = ?')
        .bind(address.toLowerCase())
        .first();
      return result || null;
    },

    createAccessCode: async (args: { address: string }) => {
      const { address } = args;
      const normalizedAddress = address.toLowerCase();
      
      // Check if access code already exists
      const existing = await db
        .prepare('SELECT * FROM access_codes WHERE address = ?')
        .bind(normalizedAddress)
        .first();
      
      if (existing) {
        return existing;
      }
      
      // Generate new access code (32 bytes = 64 hex characters)
      // Use crypto.randomUUID() and combine multiple UUIDs for 64 hex chars, or use crypto.subtle for random bytes
      // For Cloudflare Workers, we can use crypto.randomUUID() multiple times
      const uuid1 = crypto.randomUUID().replace(/-/g, '');
      const uuid2 = crypto.randomUUID().replace(/-/g, '');
      const uuid3 = crypto.randomUUID().replace(/-/g, '').substring(0, 8);
      const accessCode = (uuid1 + uuid2 + uuid3).substring(0, 64);
      
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Insert new access code
      await db
        .prepare('INSERT INTO access_codes (address, accessCode, createdAt) VALUES (?, ?, ?)')
        .bind(normalizedAddress, accessCode, timestamp)
        .run();
      
      return {
        address: normalizedAddress,
        accessCode,
        createdAt: timestamp,
      };
    },
  };
}

// Helper function to validate access code (for Workers)
export async function validateAccessCode(db: any, accessCode: string | null | undefined): Promise<boolean> {
  if (!accessCode) return false;
  try {
    const row = await db
      .prepare('SELECT accessCode FROM access_codes WHERE accessCode = ?')
      .bind(accessCode)
      .first();
    
    if (row) {
      // Update lastUsedAt
      const timestamp = Math.floor(Date.now() / 1000);
      await db
        .prepare('UPDATE access_codes SET lastUsedAt = ? WHERE accessCode = ?')
        .bind(timestamp, accessCode)
        .run();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error validating access code:', error);
    return false;
  }
}

