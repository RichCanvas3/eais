/**
 * Cloudflare D1 Database Adapter for Node.js
 * Provides a better-sqlite3 compatible interface for Cloudflare D1
 */

interface D1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

interface D1Response {
  success: boolean;
  results?: any[];
  meta?: {
    rows_read: number;
    rows_written: number;
    duration: number;
  };
  error?: string;
}

class D1Database {
  private config: D1Config;
  private baseUrl: string;

  constructor(config: D1Config) {
    this.config = config;
    // Validate account ID format (should be hex, not email)
    if (!/^[a-f0-9]{32}$/i.test(config.accountId)) {
      throw new Error(`Invalid Cloudflare Account ID format. Expected 32-character hex string, got: ${config.accountId.substring(0, 20)}...\n\nTo find your Account ID:\n1. Go to https://dash.cloudflare.com/\n2. Look in the right sidebar for "Account ID"\n3. It should look like: 0123456789abcdef0123456789abcdef`);
    }
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}`;
  }

  private async execute(query: string, params: any[] = []): Promise<D1Response> {
    // At this point, params should always be an array (already converted by prepare())
    // D1 API expects positional parameters (? placeholders) with params as an array
    const paramsArray = Array.isArray(params) ? params : [];

    const response = await fetch(`${this.baseUrl}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql: query,
        params: paramsArray,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`D1 API error: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;
    
    if (!data.success && data.error) {
      throw new Error(`D1 error: ${data.error}`);
    }

    return (data.result?.[0] || data) as D1Response;
  }

  prepare(sql: string) {
    // Replace @param with ? in SQL and extract parameter values
    const processSQLAndParams = (sql: string, params: any[]): { sql: string; params: any[] } => {
      // If params is a single object (named parameters), convert to positional
      if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
        // Named parameters - extract in order from SQL
        const namedParams = params[0];
        const paramNames: string[] = [];
        const paramPattern = /@(\w+)/g;
        let match;
        let processedSQL = sql;
        
        // Find all @param names in SQL in order
        while ((match = paramPattern.exec(sql)) !== null) {
          if (!paramNames.includes(match[1])) {
            paramNames.push(match[1]);
          }
        }
        
        // Replace @param with ? and extract values
        paramNames.forEach(name => {
          processedSQL = processedSQL.replace(new RegExp(`@${name}\\b`, 'g'), '?');
        });
        
        const paramValues = paramNames.map(name => namedParams[name]);
        return { sql: processedSQL, params: paramValues };
      }
      
      // Positional parameters - SQL already has ? placeholders, just return params as-is
      return { sql, params };
    };

    return {
      run: async (...params: any[]) => {
        const { sql: processedSQL, params: paramArray } = processSQLAndParams(sql, params);
        const result = await this.execute(processedSQL, paramArray);
        return {
          changes: result.meta?.rows_written || 0,
          lastInsertRowid: 0,
        };
      },
      get: async (...params: any[]) => {
        const { sql: processedSQL, params: paramArray } = processSQLAndParams(sql, params);
        const result = await this.execute(processedSQL, paramArray);
        return result.results?.[0] || null;
      },
      all: async (...params: any[]) => {
        const { sql: processedSQL, params: paramArray } = processSQLAndParams(sql, params);
        const result = await this.execute(processedSQL, paramArray);
        return result.results || [];
      },
    };
  }

  async exec(sql: string): Promise<void> {
    // For exec, we might have multiple statements
    const statements = sql.split(';').filter(s => s.trim());
    await Promise.all(statements.map(stmt => this.execute(stmt.trim())));
  }

  pragma(sql: string) {
    // PRAGMA commands aren't supported in D1 the same way
    // Just ignore or handle specially
    console.warn(`PRAGMA not supported in D1: ${sql}`);
    return {};
  }
}

export function createD1Database(config: D1Config): D1Database {
  return new D1Database(config);
}

