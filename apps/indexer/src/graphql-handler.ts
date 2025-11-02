/**
 * Shared GraphQL request handling logic for both Express (local) and Workers (production)
 */

import { graphql, GraphQLSchema } from 'graphql';
import { validateAccessCode } from './graphql-resolvers.js';

export interface GraphQLRequest {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}

export interface GraphQLContext {
  db: any;
  env?: any;
  createDBQueries: (db: any, env?: any) => any | Promise<any>; // May be async for Workers
}

/**
 * Check if request needs authentication (access code operations skip auth)
 */
export function needsAuthentication(query: string, operationName?: string): boolean {
  const queryString = (query || '').toString();
  const isAccessCodeOperation = 
    operationName === 'getAccessCode' || 
    operationName === 'createAccessCode' ||
    (typeof queryString === 'string' && queryString.includes('getAccessCode')) || 
    (typeof queryString === 'string' && queryString.includes('createAccessCode'));
  const isIndexAgentOperation = 
    operationName === 'indexAgent' ||
    (typeof queryString === 'string' && queryString.includes('indexAgent'));
  
  return !isAccessCodeOperation && !isIndexAgentOperation;
}

/**
 * Extract access code from Authorization header
 */
export function extractAccessCode(authHeader: string | null): string {
  if (!authHeader) return '';
  return authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7).trim() 
    : authHeader.trim();
}

/**
 * Validate access code (checks both secret and user access codes)
 */
export async function validateRequestAccessCode(
  accessCode: string,
  secretAccessCode: string | undefined,
  db: any
): Promise<{ valid: boolean; error?: string }> {
  if (!accessCode) {
    return { valid: false, error: 'Access code required. Please provide Authorization header with your access code.' };
  }

  // Check secret access code from environment variable (for server-to-server)
  if (secretAccessCode && accessCode === secretAccessCode) {
    console.log('[Auth] Validated secret access code');
    return { valid: true };
  }

  // Validate regular user access code
  const isValid = await validateAccessCode(db, accessCode);
  if (!isValid) {
    console.log(`[Auth] Invalid access code. Secret code configured: ${!!secretAccessCode}, Received code length: ${accessCode.length}`);
    return { valid: false, error: 'Invalid access code. Please get your access code via the createAccessCode mutation.' };
  }

  console.log('[Auth] Validated user access code');
  return { valid: true };
}

/**
 * Execute GraphQL query/mutation
 */
export async function executeGraphQL(
  schema: GraphQLSchema,
  request: GraphQLRequest,
  context: GraphQLContext
): Promise<any> {
  const { query, variables = {}, operationName } = request;
  const { db, env, createDBQueries } = context;

  if (!query) {
    return {
      errors: [{ message: 'Query is required' }],
    };
  }

  // createDBQueries may be async (for Workers) or sync (for Express)
  const dbQueries = createDBQueries(db, env);
  const rootValue = dbQueries instanceof Promise ? await dbQueries : dbQueries;
  
  const result = await graphql({
    schema,
    source: query,
    rootValue,
    variableValues: variables,
    operationName,
  });

  return result;
}

/**
 * Parse GraphQL request from Fetch API Request
 */
export async function parseGraphQLRequest(request: Request, url: URL): Promise<GraphQLRequest | null> {
  if (request.method === 'POST') {
    try {
      const body = await request.json() as any;
      return {
        query: body.query || '',
        variables: body.variables || {},
        operationName: body.operationName,
      };
    } catch (error) {
      return null;
    }
  } else if (request.method === 'GET' && url.searchParams.get('query')) {
    return {
      query: url.searchParams.get('query') || '',
      variables: url.searchParams.get('variables') 
        ? JSON.parse(url.searchParams.get('variables')!) 
        : {},
      operationName: url.searchParams.get('operationName') || undefined,
    };
  }
  
  return null;
}

/**
 * Parse GraphQL request from Express request
 */
export function parseGraphQLRequestExpress(req: any): GraphQLRequest {
  return {
    query: req.body?.query || req.query?.query || '',
    variables: req.body?.variables || (req.query?.variables ? JSON.parse(req.query.variables) : {}),
    operationName: req.body?.operationName || req.query?.operationName,
  };
}

/**
 * CORS headers
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

