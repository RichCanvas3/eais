import { NextRequest, NextResponse } from 'next/server';
import { uploadJsonToPinata } from '@/lib/pinata';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('Handling Pinata IPFS credentials save request');
  
  try {
    if (!process.env.PINATA_JWT) {
      return NextResponse.json(
        { error: 'Pinata not configured. PINATA_JWT environment variable is required.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { credentials, did } = body;
    
    if (!credentials || !did) {
      return NextResponse.json(
        { error: 'Credentials and DID are required' },
        { status: 400 }
      );
    }

    const filename = `credentials_${did}.json`;
    const cid = await uploadJsonToPinata(credentials, filename);

    console.log('Successfully saved credentials to Pinata IPFS:', cid);
    return NextResponse.json({ 
      success: true, 
      cid: cid,
      url: `https://gateway.pinata.cloud/ipfs/${cid}`
    });
  } catch (error: any) {
    console.error('Error saving credentials to Pinata IPFS:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
