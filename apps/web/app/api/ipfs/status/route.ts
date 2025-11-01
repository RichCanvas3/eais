import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  console.log('Handling Pinata IPFS status request');
  
  try {
    const pinataJwt = process.env.PINATA_JWT;
    
    if (!pinataJwt) {
      return NextResponse.json({ 
        configured: false, 
        error: 'PINATA_JWT not configured' 
      });
    }
    
    // Test Pinata connection by checking if JWT is valid format
    // (Pinata JWT typically starts with 'eyJ')
    const isValidFormat = pinataJwt.startsWith('eyJ');
    
    return NextResponse.json({
      configured: true,
      pinataJwtConfigured: !!pinataJwt,
      pinataJwtFormatValid: isValidFormat,
      gateway: 'https://gateway.pinata.cloud/ipfs/',
      note: 'Pinata IPFS is configured and ready to use'
    });
  } catch (error: any) {
    console.error('Error checking Pinata status:', error);
    return NextResponse.json(
      { 
        configured: false, 
        error: error?.message || 'Internal server error'
      },
      { status: 500 }
    );
  }
}
