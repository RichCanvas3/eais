import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, chainId } = body;

    if (!agentId) {
      return NextResponse.json(
        { error: 'agentId is required' },
        { status: 400 }
      );
    }

    // Get the GraphQL endpoint from environment variable
    const graphqlUrl = process.env.NEXT_PUBLIC_INDEXER_GRAPHQL_URL || process.env.INDEXER_GRAPHQL_URL;
    if (!graphqlUrl) {
      return NextResponse.json(
        { error: 'GraphQL endpoint not configured' },
        { status: 500 }
      );
    }

    // Use secret access code for server-to-server authentication
    const secretAccessCode = process.env.GRAPHQL_SECRET_ACCESS_CODE;
    if (!secretAccessCode) {
      return NextResponse.json(
        { error: 'GraphQL secret access code not configured' },
        { status: 500 }
      );
    }

    // Call the indexer GraphQL mutation
    const mutation = `
      mutation IndexAgent($agentId: String!, $chainId: Int) {
        indexAgent(agentId: $agentId, chainId: $chainId) {
          success
          message
          processedChains
        }
      }
    `;

    const variables: { agentId: string; chainId?: number } = { agentId };
    if (chainId !== undefined) {
      variables.chainId = chainId;
    }

    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${secretAccessCode}`,
      },
      body: JSON.stringify({
        query: mutation,
        variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('GraphQL request failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to index agent', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return NextResponse.json(
        { error: 'GraphQL errors', details: data.errors },
        { status: 500 }
      );
    }

    return NextResponse.json(data.data);
  } catch (error: any) {
    console.error('Error indexing agent:', error);
    return NextResponse.json(
      { error: 'Internal server error', message: error?.message },
      { status: 500 }
    );
  }
}

