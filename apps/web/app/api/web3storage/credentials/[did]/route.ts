import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { did: string } }
) {
  console.log('Handling Web3.Storage credentials retrieval request');
  
  try {
    const { did } = params;
    if (!did) {
      return NextResponse.json(
        { error: 'DID is required' },
        { status: 400 }
      );
    }

    // For now, we'll return empty data since we need to implement hash tracking
    // In a real implementation, you'd store the hash mapping in a database
    return NextResponse.json({ success: true, data: [] });
  } catch (error: any) {
    console.error('Error retrieving credentials from Web3.Storage:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { did: string } }
) {
  console.log('Handling Web3.Storage credentials deletion request');
  
  try {
    const { did } = params;
    if (!did) {
      return NextResponse.json(
        { error: 'DID is required' },
        { status: 400 }
      );
    }

    // For now, we'll return success since deletion is handled client-side
    // In a real implementation, you'd track and delete the actual files
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting credentials from Web3.Storage:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
