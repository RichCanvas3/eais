import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function queryGraphQL(query: string, variables: any = {}) {
  // Get GraphQL endpoint URL from environment at runtime
  const GRAPHQL_URL = process.env.GRAPHQL_API_URL || process.env.NEXT_PUBLIC_GRAPHQL_API_URL || 'https://erc8004-indexer-graphql.richardpedersen3.workers.dev/graphql';
  
  try {
    console.info("++++++++++++++++++++ queryGraphQL: GRAPHQL_URL", GRAPHQL_URL);
    if (!GRAPHQL_URL) {
      // Fallback to empty data if GraphQL URL not configured
      console.warn("No GRAPHQL_URL configured");
      return null;
    }

    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      console.error(`GraphQL request failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return null;
    }

    return data.data;
  } catch (error: any) {
    console.error('GraphQL fetch error:', error?.message || error);
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10)));
    const offset = (page - 1) * pageSize;

    const name = (searchParams.get('name') || '').trim();
    const id = (searchParams.get('id') || '').trim();
    const address = (searchParams.get('address') || '').trim();
    const chainId = searchParams.get('chainId');

    // Build GraphQL query
    const filters: any = { limit: pageSize, offset };
    if (chainId) filters.chainId = parseInt(chainId);
    if (id) filters.agentId = id;
    if (address) filters.agentOwner = address.toLowerCase();
    if (name) filters.agentName = name.toLowerCase();

    const query = `
      query GetAgents($chainId: Int, $agentId: String, $agentOwner: String, $agentName: String, $limit: Int, $offset: Int) {
        agents(chainId: $chainId, agentId: $agentId, agentOwner: $agentOwner, agentName: $agentName, limit: $limit, offset: $offset) {
          chainId
          agentId
          agentAddress
          agentOwner
          agentName
          description
          image
          a2aEndpoint
          ensEndpoint
          agentAccountEndpoint
          supportedTrust
          rawJson
          metadataURI
          createdAtBlock
          createdAtTime
        }
      }
    `;

    const data = await queryGraphQL(query, filters);

    if (!data) {
      // Return empty data if GraphQL is not available
      return NextResponse.json({ rows: [], total: 0, page, pageSize });
    }

    const rows = data.agents || [];

    // Get total count (using a separate query for simplicity)
    const countQuery = `
      query GetAgentsCount($chainId: Int, $agentId: String, $agentOwner: String, $agentName: String) {
        agents(chainId: $chainId, agentId: $agentId, agentOwner: $agentOwner, agentName: $agentName, limit: 10000, offset: 0) {
          agentId
        }
      }
    `;
    const countData = await queryGraphQL(countQuery, filters);
    const total = countData?.agents?.length || rows.length;

    return NextResponse.json({ rows, total, page, pageSize });
  } catch (e: any) {
    console.error('API error:', e);
    // Return empty data on error to prevent site crash
    return NextResponse.json({ rows: [], total: 0, page: 1, pageSize: 50 });
  }
}
