import { NextRequest, NextResponse } from 'next/server';
import { getAccountOwnerByDidEthr, parseEthrDid } from '@agentic-trust/core/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { 'did:ethr': string } }
) {
  try {
    const didEthr = params['did:ethr'];

    let parsed;
    try {
      parsed = parseEthrDid(didEthr);
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : 'Invalid ETHR DID';
      return NextResponse.json(
        { error: 'Invalid ETHR DID', message },
        { status: 400 },
      );
    }

    const { account, chainId } = parsed;

    const owner = await getAccountOwnerByDidEthr(didEthr);

    if (owner === null) {
      return NextResponse.json(
        {
          error: 'Account owner not found',
          message: 'Unable to retrieve owner for the given account address',
          account,
          chainId,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      owner,
      account,
      chainId,
    });
  } catch (error) {
    console.error('Error getting account owner:', error);
    return NextResponse.json(
      {
        error: 'Failed to get account owner',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}


