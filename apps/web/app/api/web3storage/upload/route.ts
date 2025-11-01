import { NextRequest, NextResponse } from 'next/server';
import { initializeWeb3Storage } from '@/lib/web3storage';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log('Handling Web3.Storage upload request');
  
  try {
    // Initialize with timeout protection at the route level
    const initPromise = initializeWeb3Storage();
    const initTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Web3.Storage initialization timeout (60s)')), 60000); // 60 second timeout
    });
    
    const client = await Promise.race([initPromise, initTimeout]) as Awaited<ReturnType<typeof initializeWeb3Storage>>;
    
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
    
    console.log('📤 Uploading file...');
    // Upload with timeout protection
    const uploadPromise = client.uploadFile(file);
    const uploadTimeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Web3.Storage upload timeout (120s)')), 120000); // 120 second timeout
    });
    const cid = await Promise.race([uploadPromise, uploadTimeout]) as Awaited<ReturnType<typeof client.uploadFile>>;

    console.log('Successfully uploaded to Web3.Storage:', cid.toString());
    return NextResponse.json({ 
      success: true, 
      cid: cid.toString(),
      url: `https://${cid.toString()}.ipfs.w3s.link`
    });
  } catch (error: any) {
    console.error('Error uploading to Web3.Storage:', error);
    const errorMessage = error?.message || 'Internal server error';
    
    // Return appropriate status code for timeouts
    const statusCode = errorMessage.includes('timeout') ? 504 : 500;
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
