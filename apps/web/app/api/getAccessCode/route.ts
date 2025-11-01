import { NextRequest, NextResponse } from 'next/server';

async function queryGraphQL(query: string, variables: any = {}) {
  const GRAPHQL_URL = process.env.GRAPHQL_API_URL || process.env.NEXT_PUBLIC_GRAPHQL_API_URL;
  
  if (!GRAPHQL_URL) {
    throw new Error('GRAPHQL_URL not configured');
  }

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`GraphQL request failed: ${res.status} ${errorText}`);
  }

  const data = await res.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data.data;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json(
        { error: 'Address is required' },
        { status: 400 }
      );
    }

    // First try to get existing access code
    const getQuery = `
      query GetAccessCode($address: String!) {
        getAccessCode(address: $address) {
          address
          accessCode
          createdAt
        }
      }
    `;

    const getResult = await queryGraphQL(getQuery, { address: address.toLowerCase() });

    if (getResult?.getAccessCode) {
      return NextResponse.json({ accessCode: getResult.getAccessCode.accessCode });
    }

    // If not found, create a new one
    const createMutation = `
      mutation CreateAccessCode($address: String!) {
        createAccessCode(address: $address) {
          address
          accessCode
          createdAt
        }
      }
    `;

    const createResult = await queryGraphQL(createMutation, { address: address.toLowerCase() });

    if (!createResult?.createAccessCode) {
      throw new Error('Failed to create access code');
    }

    return NextResponse.json({ 
      accessCode: createResult.createAccessCode.accessCode 
    });
  } catch (error) {
    console.error('Error getting/creating access code:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

