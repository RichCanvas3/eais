import { NextResponse } from 'next/server';

export const runtime = 'edge';

// Get GraphQL endpoint URL from environment
const GRAPHQL_URL = process.env.GRAPHQL_API_URL || process.env.NEXT_PUBLIC_GRAPHQL_API_URL;

async function queryGraphQL(query: string, variables: any = {}) {
  if (!GRAPHQL_URL) {
    return null;
  }

  try {
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
  } catch (error) {
    console.error('GraphQL fetch error:', error);
    return null;
  }
}

export async function GET(req: Request, { params }: { params: { agentId: string } }) {
  try {
    const agentId = String(params.agentId);
    const { searchParams } = new URL(req.url);
    const chainId = searchParams.get('chainId');

    if (chainId) {
      // Use specific chainId
      const query = `
        query GetAgent($chainId: Int!, $agentId: String!) {
          agent(chainId: $chainId, agentId: $agentId) {
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

      const data = await queryGraphQL(query, {
        chainId: parseInt(chainId),
        agentId
      });

      if (!data || !data.agent) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json(data.agent);
    } else {
      // Search across all chains (return first match)
      const query = `
        query GetAgents($agentId: String!) {
          agents(agentId: $agentId, limit: 1, offset: 0) {
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

      const data = await queryGraphQL(query, { agentId });

      if (!data || !data.agents || data.agents.length === 0) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      return NextResponse.json(data.agents[0]);
    }
  } catch (e: any) {
    console.error('Agent API error:', e);
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
