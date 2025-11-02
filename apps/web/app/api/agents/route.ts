import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function queryGraphQL(query: string, variables: any = {}) {
  // Get GraphQL endpoint URL from environment at runtime
  const GRAPHQL_URL = process.env.GRAPHQL_API_URL || process.env.NEXT_PUBLIC_GRAPHQL_API_URL;
  console.info("++++++++++++++++++++ queryGraphQL 0: GRAPHQL_URL", GRAPHQL_URL);
  try {
    console.info("++++++++++++++++++++ queryGraphQL 1: GRAPHQL_URL", GRAPHQL_URL);
    if (!GRAPHQL_URL) {
      // Fallback to empty data if GraphQL URL not configured
      console.warn("No GRAPHQL_URL configured");
      return null;
    }

    const requestBody = { query, variables };
    console.info("++++++++++++++++++++ queryGraphQL request body: ", JSON.stringify(requestBody, null, 2));

    // Get secret access code for server-to-server authentication
    const secretAccessCode = process.env.GRAPHQL_SECRET_ACCESS_CODE;
    console.info("++++++++++++++++++++ queryGraphQL auth check:", {
      hasSecretAccessCode: !!secretAccessCode,
      secretAccessCodeLength: secretAccessCode?.length || 0,
      secretAccessCodePreview: secretAccessCode ? `${secretAccessCode.substring(0, 8)}...` : 'none'
    });
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (secretAccessCode) {
      headers['Authorization'] = `Bearer ${secretAccessCode}`;
      console.info("++++++++++++++++++++ queryGraphQL Authorization header set");
    } else {
      console.warn("⚠️ GRAPHQL_SECRET_ACCESS_CODE not configured! Requests will fail.");
    }

    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
      cache: 'no-store', // Disable Next.js fetch caching
      next: { revalidate: 0 }, // Ensure no revalidation caching
    });


    if (!res.ok) {
      const errorText = await res.text();
      console.error(`GraphQL request failed: ${res.status} ${res.statusText}`, errorText);
      return null;
    }

    const data = await res.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return null;
    }
    console.info("++++++++++++++++++++ queryGraphQL response - has data:", !!data.data, "has errors:", !!data.errors);
    if (data.data) {
      console.info("++++++++++++++++++++ queryGraphQL data.agents count:", data.data.agents?.length || 0);
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
    const filters: any = { limit: pageSize, offset, orderBy: 'agentId', orderDirection: 'desc' };
    if (chainId) filters.chainId = parseInt(chainId);
    if (id) filters.agentId = id;
    if (address) filters.agentOwner = address.toLowerCase();
    if (name) filters.agentName = name.toLowerCase();

    const query = `
      query GetAgents($chainId: Int, $agentId: String, $agentOwner: String, $agentName: String, $limit: Int, $offset: Int, $orderBy: String, $orderDirection: String) {
        agents(chainId: $chainId, agentId: $agentId, agentOwner: $agentOwner, agentName: $agentName, limit: $limit, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection) {
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
    console.info("++++++++++++++++++++ GET MAIN QUERY data: ", JSON.stringify(data, null, 2));
    console.info("++++++++++++++++++++ GET filters: ", filters);

    if (!data) {
      // Return empty data if GraphQL is not available
      console.warn("⚠️ No data returned from GraphQL query");
      return NextResponse.json({ rows: [], total: 0, page, pageSize });
    }

    const rows = data.agents || [];
    console.info("++++++++++++++++++++ GET rows count: ", rows.length);
    if (rows.length > 0) {
      console.info("++++++++++++++++++++ GET first row sample: ", JSON.stringify(rows[0], null, 2));
      // Log max agentId to verify we're getting the latest
      const maxAgentId = Math.max(...rows.map((r: any) => parseInt(r.agentId || '0', 10)));
      console.info("++++++++++++++++++++ GET max agentId in results: ", maxAgentId);
    }

    // Get total count using the new countAgents query (more efficient)
    const countFilters: any = {};
    if (chainId) countFilters.chainId = parseInt(chainId);
    if (id) countFilters.agentId = id;
    if (address) countFilters.agentOwner = address.toLowerCase();
    if (name) countFilters.agentName = name.toLowerCase();
    
    const countQuery = `
      query GetAgentsCount($chainId: Int, $agentId: String, $agentOwner: String, $agentName: String) {
        countAgents(chainId: $chainId, agentId: $agentId, agentOwner: $agentOwner, agentName: $agentName)
      }
    `;
    const countData = await queryGraphQL(countQuery, countFilters);
    const total = countData?.countAgents || rows.length;

    return NextResponse.json({ rows, total, page, pageSize });
  } catch (e: any) {
    console.error('API error:', e);
    // Return empty data on error to prevent site crash
    return NextResponse.json({ rows: [], total: 0, page: 1, pageSize: 50 });
  }
}
