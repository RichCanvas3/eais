import { NextRequest, NextResponse } from 'next/server';
import { create } from '@web3-storage/w3up-client';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('Handling Web3.Storage status request');
  
  try {
    if (!process.env.WEB3_STORAGE_EMAIL) {
      return NextResponse.json({ 
        configured: false, 
        error: 'WEB3_STORAGE_EMAIL not configured' 
      });
    }
    
    const client = await create();
    const email = process.env.WEB3_STORAGE_EMAIL;
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email format');
    }
    await client.login(email as `${string}@${string}`);
    const spaces = await client.spaces();
    
    return NextResponse.json({
      configured: true,
      email: process.env.WEB3_STORAGE_EMAIL,
      spaceDid: process.env.WEB3_STORAGE_SPACE_DID,
      availableSpaces: spaces.map(s => s.did()),
      targetSpaceExists: spaces.find(s => s.did() === process.env.WEB3_STORAGE_SPACE_DID) !== undefined
    });
  } catch (error: any) {
    console.error('Error checking Web3.Storage status:', error);
    return NextResponse.json(
      { 
        configured: false, 
        error: error?.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}
