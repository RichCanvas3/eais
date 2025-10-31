import { NextResponse } from 'next/server';

// Get GraphQL endpoint URL from environment
const GRAPHQL_URL = process.env.GRAPHQL_API_URL || process.env.NEXT_PUBLIC_GRAPHQL_API_URL;

async function queryGraphQL(query: string, variables: any = {}) {
  if (!GRAPHQL_URL) {
    return null;
  }

  try {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      console.error(`GraphQL request failed: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    if (data.errors) {
      console.error('GraphQL errors:', data.errors);
      return null;
    }

    return data.data;
  } catch (error) {
    console.error('GraphQL fetch error:', error);
    return null;
  }
}

export async function GET() {
  try {
    // Get all agents grouped by chain
    const query = `
      query GetStats {
        agents(limit: 10000, offset: 0) {
          chainId
          agentId
          agentName
          description
          image
          metadataURI
          ensEndpoint
          createdAtTime
        }
      }
    `;

    const data = await queryGraphQL(query);

    if (!data || !data.agents) {
      // Return empty stats if GraphQL is not available
      return NextResponse.json({
        summary: {
          totalAgents: 0,
          totalChains: 0,
          chains: []
        },
        metadata: { chains: [] },
        ens: { chains: [] },
        activity: { recent24h: [] },
        topAgents: []
      });
    }

    const agents = data.agents || [];
    const last24Hours = Math.floor(Date.now() / 1000) - 86400;

    // Group by chain
    const chainGroups: Record<number, typeof agents> = {};
    agents.forEach((agent: any) => {
      if (!chainGroups[agent.chainId]) {
        chainGroups[agent.chainId] = [];
      }
      chainGroups[agent.chainId].push(agent);
    });

    const getChainName = (chainId: number) => {
      switch (chainId) {
        case 11155111: return 'ETH Sepolia';
        case 84532: return 'Base Sepolia';
        case 11155420: return 'OP Sepolia';
        default: return `Chain ${chainId}`;
      }
    };

    // Calculate stats per chain
    const chains = Object.keys(chainGroups).map(chainIdStr => {
      const chainId = parseInt(chainIdStr);
      const chainAgents = chainGroups[chainId];
      const withMetadata = chainAgents.filter((a: any) => a.metadataURI).length;
      const withENS = chainAgents.filter((a: any) => a.ensEndpoint).length;
      const recent = chainAgents.filter((a: any) => a.createdAtTime > last24Hours).length;

      return {
        chainId,
        chainName: getChainName(chainId),
        count: chainAgents.length,
        withMetadata,
        withoutMetadata: chainAgents.length - withMetadata,
        withENS,
        withoutENS: chainAgents.length - withENS,
        recentCount: recent
      };
    });

    // Get top agents (sorted by agentId)
    const topAgents = agents
      .slice(0, 10)
      .map((agent: any) => ({
        chainId: agent.chainId,
        chainName: getChainName(agent.chainId),
        agentId: agent.agentId,
        agentName: agent.agentName || 'Unnamed',
        ensName: agent.ensEndpoint || null
      }));

    return NextResponse.json({
      summary: {
        totalAgents: agents.length,
        totalChains: chains.length,
        chains: chains.map(c => ({
          chainId: c.chainId,
          chainName: c.chainName,
          agentCount: c.count
        }))
      },
      metadata: {
        chains: chains.map(c => ({
          chainId: c.chainId,
          chainName: c.chainName,
          withMetadata: c.withMetadata,
          withoutMetadata: c.withoutMetadata,
          metadataPercentage: c.count > 0 ? Math.round((c.withMetadata / c.count) * 100) : 0
        }))
      },
      ens: {
        chains: chains.map(c => ({
          chainId: c.chainId,
          chainName: c.chainName,
          withENS: c.withENS,
          withoutENS: c.withoutENS,
          ensPercentage: c.count > 0 ? Math.round((c.withENS / c.count) * 100) : 0
        }))
      },
      activity: {
        recent24h: chains.map(c => ({
          chainId: c.chainId,
          chainName: c.chainName,
          recentCount: c.recentCount
        }))
      },
      topAgents
    });
  } catch (e: any) {
    console.error('Stats API error:', e);
    // Return empty stats on error to prevent site crash
    return NextResponse.json({
      summary: {
        totalAgents: 0,
        totalChains: 0,
        chains: []
      },
      metadata: { chains: [] },
      ens: { chains: [] },
      activity: { recent24h: [] },
      topAgents: []
    });
  }
}
