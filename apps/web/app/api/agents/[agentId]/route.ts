import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: { agentId: string } }
) {
  const agentId = params.agentId;
  
  if (!agentId) {
    return NextResponse.json({ error: 'Missing agentId' }, { status: 400 });
  }

  try {
    const row = db.prepare(`
      SELECT a.agentId,
             a.agentAddress,
             a.agentOwner,
             a.metadataURI,
             a.createdAtBlock,
             a.createdAtTime,
             m.agentName,
             m.description as description,
             m.a2aEndpoint as a2aEndpoint,
             m.ensEndpoint as ensEndpoint
      FROM agents a
      LEFT JOIN agent_metadata m ON m.agentId = a.agentId
      WHERE a.agentId = ?
    `).get(agentId);

    if (!row) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch agent' }, { status: 500 });
  }
}

