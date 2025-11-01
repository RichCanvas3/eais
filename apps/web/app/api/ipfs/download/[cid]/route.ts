import { NextRequest, NextResponse } from 'next/server';
import { getJsonFromPinata } from '@/lib/pinata';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { cid: string } }
) {
  console.log('Handling Pinata IPFS download request');
  
  try {
    const { cid } = params;
    if (!cid) {
      return NextResponse.json(
        { error: 'CID is required' },
        { status: 400 }
      );
    }

    console.log('Downloading from Pinata IPFS:', cid);
    const data = await getJsonFromPinata(cid);
    
    console.log('Successfully downloaded from Pinata IPFS:', cid);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error downloading from Pinata IPFS:', error);
    const statusCode = error?.message?.includes('not found') || error?.message?.includes('Failed to retrieve') ? 404 : 500;
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: statusCode }
    );
  }
}
