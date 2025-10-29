import { NextResponse } from 'next/server';
import { db } from '../../../../indexer/src/db';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.max(1, Math.min(100, parseInt(searchParams.get('pageSize') || '50', 10)));
    const offset = (page - 1) * pageSize;

    const name = (searchParams.get('name') || '').trim().toLowerCase();
    const id = (searchParams.get('id') || '').trim();
    const address = (searchParams.get('address') || '').trim().toLowerCase();
    const chainId = searchParams.get('chainId');

    const where: string[] = [];
    const params: any[] = [];
    if (name) {
      where.push('(lower(agentName) LIKE ? OR lower(ensEndpoint) LIKE ?)');
      const namePattern = `%${name}%`;
      params.push(namePattern, namePattern);
    }
    if (id) {
      where.push('agentId = ?');
      params.push(id);
    }
    if (address) {
      where.push('(lower(agentAddress) LIKE ? OR lower(agentOwner) LIKE ?)');
      const addrPattern = `%${address}%`;
      params.push(addrPattern, addrPattern);
    }
    if (chainId) {
      where.push('chainId = ?');
      params.push(parseInt(chainId));
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = await db.prepare(`
      SELECT chainId, agentId, agentAddress, agentOwner, agentName, description, image, a2aEndpoint, ensEndpoint,
             agentAccountEndpoint, supportedTrust, rawJson, metadataURI, createdAtBlock, createdAtTime
      FROM agents
      ${whereSql}
      ORDER BY length(agentId) ASC, agentId ASC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[];

    const total = await db.prepare(`
      SELECT COUNT(1) as c
      FROM agents
      ${whereSql}
    `).get(...params) as { c: number };


    return NextResponse.json({ rows, total: total.c, page, pageSize });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 });
  }
}
