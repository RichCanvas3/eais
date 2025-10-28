import { NextResponse } from 'next/server';
import { db } from '../../../../indexer/src/db';

export async function GET() {
  try {
    // Get total agents per chain
    const agentsPerChain = db.prepare(`
      SELECT 
        chainId,
        COUNT(*) as count,
        CASE 
          WHEN chainId = 11155111 THEN 'ETH Sepolia'
          WHEN chainId = 84532 THEN 'Base Sepolia'
          WHEN chainId = 11155420 THEN 'OP Sepolia'
          ELSE 'Chain ' || chainId
        END as chainName
      FROM agents 
      GROUP BY chainId 
      ORDER BY chainId
    `).all() as Array<{ chainId: number; count: number; chainName: string }>;

    // Get total agents across all chains
    const totalAgents = db.prepare(`
      SELECT COUNT(*) as total FROM agents
    `).get() as { total: number };

    // Get agents with metadata vs without
    const agentsWithMetadata = db.prepare(`
      SELECT 
        chainId,
        COUNT(CASE WHEN metadataURI IS NOT NULL AND metadataURI != '' THEN 1 END) as withMetadata,
        COUNT(*) as total,
        CASE 
          WHEN chainId = 11155111 THEN 'ETH Sepolia'
          WHEN chainId = 84532 THEN 'Base Sepolia'
          WHEN chainId = 11155420 THEN 'OP Sepolia'
          ELSE 'Chain ' || chainId
        END as chainName
      FROM agents 
      GROUP BY chainId 
      ORDER BY chainId
    `).all() as Array<{ chainId: number; withMetadata: number; total: number; chainName: string }>;

    // Get agents with ENS names vs without
    const agentsWithENS = db.prepare(`
      SELECT 
        chainId,
        COUNT(CASE WHEN ensEndpoint IS NOT NULL AND ensEndpoint != '' THEN 1 END) as withENS,
        COUNT(*) as total,
        CASE 
          WHEN chainId = 11155111 THEN 'ETH Sepolia'
          WHEN chainId = 84532 THEN 'Base Sepolia'
          WHEN chainId = 11155420 THEN 'OP Sepolia'
          ELSE 'Chain ' || chainId
        END as chainName
      FROM agents 
      GROUP BY chainId 
      ORDER BY chainId
    `).all() as Array<{ chainId: number; withENS: number; total: number; chainName: string }>;

    // Get recent activity (last 24 hours)
    const recentActivity = db.prepare(`
      SELECT 
        chainId,
        COUNT(*) as recentCount,
        CASE 
          WHEN chainId = 11155111 THEN 'ETH Sepolia'
          WHEN chainId = 84532 THEN 'Base Sepolia'
          WHEN chainId = 11155420 THEN 'OP Sepolia'
          ELSE 'Chain ' || chainId
        END as chainName
      FROM agents 
      WHERE createdAtTime > (strftime('%s', 'now') - 86400)
      GROUP BY chainId 
      ORDER BY chainId
    `).all() as Array<{ chainId: number; recentCount: number; chainName: string }>;

    // Get top agent IDs by chain
    const topAgentIds = db.prepare(`
      SELECT 
        chainId,
        agentId,
        agentName,
        ensEndpoint,
        CASE 
          WHEN chainId = 11155111 THEN 'ETH Sepolia'
          WHEN chainId = 84532 THEN 'Base Sepolia'
          WHEN chainId = 11155420 THEN 'OP Sepolia'
          ELSE 'Chain ' || chainId
        END as chainName
      FROM agents 
      ORDER BY chainId, CAST(agentId AS INTEGER) ASC
      LIMIT 10
    `).all() as Array<{ chainId: number; agentId: string; agentName: string; ensEndpoint: string | null; chainName: string }>;

    return NextResponse.json({
      summary: {
        totalAgents: totalAgents.total,
        totalChains: agentsPerChain.length,
        chains: agentsPerChain.map(chain => ({
          chainId: chain.chainId,
          chainName: chain.chainName,
          agentCount: chain.count
        }))
      },
      metadata: {
        chains: agentsWithMetadata.map(chain => ({
          chainId: chain.chainId,
          chainName: chain.chainName,
          withMetadata: chain.withMetadata,
          withoutMetadata: chain.total - chain.withMetadata,
          metadataPercentage: chain.total > 0 ? Math.round((chain.withMetadata / chain.total) * 100) : 0
        }))
      },
      ens: {
        chains: agentsWithENS.map(chain => ({
          chainId: chain.chainId,
          chainName: chain.chainName,
          withENS: chain.withENS,
          withoutENS: chain.total - chain.withENS,
          ensPercentage: chain.total > 0 ? Math.round((chain.withENS / chain.total) * 100) : 0
        }))
      },
      activity: {
        recent24h: recentActivity.map(chain => ({
          chainId: chain.chainId,
          chainName: chain.chainName,
          recentCount: chain.recentCount
        }))
      },
      topAgents: topAgentIds.map(agent => ({
        chainId: agent.chainId,
        chainName: agent.chainName,
        agentId: agent.agentId,
        agentName: agent.agentName || 'Unnamed',
        ensName: agent.ensEndpoint || null
      }))
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to get stats' }, { status: 500 });
  }
}
