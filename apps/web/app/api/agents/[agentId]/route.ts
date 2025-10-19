import { NextResponse } from 'next/server';
import { db } from '../../../../../indexer/src/db';

export async function GET(_: Request, { params }: { params: { agentId: string } }) {
  try {
    const agentId = String(params.agentId);
    const row = db.prepare(`
      SELECT agentId, agentAddress, agentOwner, agentName, description, image, a2aEndpoint, ensEndpoint,
             agentAccountEndpoint, supportedTrust, rawJson, metadataURI, createdAtBlock, createdAtTime
      FROM agents
      WHERE agentId = ?
    `).get(agentId);
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}

