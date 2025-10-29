import { NextResponse } from 'next/server';
import { db } from '../../../../../indexer/src/db';

export async function GET(req: Request, { params }: { params: { agentId: string } }) {
  try {
    const agentId = String(params.agentId);
    const { searchParams } = new URL(req.url);
    const chainId = searchParams.get('chainId');
    
    let row;
    if (chainId) {
      // If chainId is provided, use composite key lookup
      row = await db.prepare(`
        SELECT chainId, agentId, agentAddress, agentOwner, agentName, description, image, a2aEndpoint, ensEndpoint,
               agentAccountEndpoint, supportedTrust, rawJson, metadataURI, createdAtBlock, createdAtTime
        FROM agents
        WHERE chainId = ? AND agentId = ?
      `).get(parseInt(chainId), agentId);
    } else {
      // If no chainId provided, return first match (for backward compatibility)
      row = await db.prepare(`
        SELECT chainId, agentId, agentAddress, agentOwner, agentName, description, image, a2aEndpoint, ensEndpoint,
               agentAccountEndpoint, supportedTrust, rawJson, metadataURI, createdAtBlock, createdAtTime
        FROM agents
        WHERE agentId = ?
        LIMIT 1
      `).get(agentId);
    }
    
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

