import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { cid: string } }
) {
  console.log('Handling Web3.Storage download request');
  
  try {
    const { cid } = params;
    if (!cid) {
      return NextResponse.json(
        { error: 'CID is required' },
        { status: 400 }
      );
    }

    console.log('Downloading from Web3.Storage:', cid);
    const url = `https://${cid}.ipfs.w3s.link`;
    const response = await fetch(url);
    
    if (!response.ok) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const data = await response.json();
    console.log('Successfully downloaded from Web3.Storage:', cid);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error downloading from Web3.Storage:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
