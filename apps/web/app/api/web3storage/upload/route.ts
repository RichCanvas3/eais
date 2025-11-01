import { NextRequest, NextResponse } from 'next/server';
import { initializeWeb3Storage } from '@/lib/web3storage';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('Handling Web3.Storage upload request');
  
  try {
    const client = await initializeWeb3Storage();
    if (!client) {
      return NextResponse.json(
        { error: 'Web3.Storage not available' },
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

    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const file = new File([blob], filename);

    const targetSpace = (client as any).targetSpace;
    if (targetSpace) {
      await client.setCurrentSpace(targetSpace.did());
    }
    
    console.log('📤 Uploading test file...');
    const cid = await client.uploadFile(file);

    console.log('Successfully uploaded to Web3.Storage:', cid.toString());
    return NextResponse.json({ 
      success: true, 
      cid: cid.toString(),
      url: `https://${cid.toString()}.ipfs.w3s.link`
    });
  } catch (error: any) {
    console.error('Error uploading to Web3.Storage:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
