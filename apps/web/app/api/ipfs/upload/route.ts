import { NextRequest, NextResponse } from 'next/server';
import { uploadJsonToPinata } from '@/lib/pinata';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('Handling Pinata IPFS upload request');
  
  try {
    if (!process.env.PINATA_JWT) {
      return NextResponse.json(
        { error: 'Pinata not configured. PINATA_JWT environment variable is required.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { data, filename = 'registration.json' } = body;
    
    if (!data) {
      return NextResponse.json(
        { error: 'Data is required' },
        { status: 400 }
      );
    }

    console.log('📤 Uploading to Pinata IPFS...');
    const cid = await uploadJsonToPinata(data, filename);

    console.log('Successfully uploaded to Pinata IPFS:', cid);
    return NextResponse.json({ 
      success: true, 
      cid: cid,
      url: `https://gateway.pinata.cloud/ipfs/${cid}`
    });
  } catch (error: any) {
    console.error('Error uploading to Pinata:', error);
    const errorMessage = error?.message || 'Internal server error';
    
    // Return appropriate status code for timeouts
    const statusCode = errorMessage.includes('timeout') ? 504 : 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
