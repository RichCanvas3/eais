export type DiscoverRequest = {
  page?: number;
  pageSize?: number;
  query?: string;
  params?: Record<string, any>;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
};

export type DiscoverResponse = {
  agents: Array<any>;
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
};

async function graphqlFetch(gqlUrl: string, token: string | undefined, body: any) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(gqlUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // Avoid dual cache directives; Next API route wrapper will control caching
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`GraphQL error ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

/**
 * Returns a client object that implements the minimal interface expected by
 * @agentic-trust/core/server discoverAgents(): an object with searchAgents().
 * Internally, it calls the Indexer GraphQL endpoint (Worker/Yoga) and maps the result.
 */
export async function getAdminClient() {
  const base =
    process.env.NEXT_PUBLIC_GRAPHQL_API_URL ||
    process.env.GRAPHQL_API_URL ||
    process.env.NEXT_PUBLIC_DISCOVERY_API_URL ||
    process.env.DISCOVERY_API_URL ||
    '';
  const gqlUrl = base ? (base.endsWith('/graphql') ? base : `${base}/graphql`) : '';
  const token =
    process.env.AGENTIC_TRUST_API_KEY ||
    process.env.GRAPHQL_SECRET_ACCESS_CODE ||
    process.env.NEXT_PUBLIC_GRAPHQL_SECRET ||
    undefined;

  return {
    agents: {
      /**
       * Basic implementation:
       * - If a free-text query is provided, use searchAgents (name/desc/id/address).
       * - Otherwise, use searchAgentsGraph with where/first/skip/orderBy/orderDirection.
       */
      async searchAgents(req: DiscoverRequest): Promise<DiscoverResponse> {
        if (!gqlUrl) throw new Error('GRAPHQL_API_URL (or NEXT_PUBLIC_GRAPHQL_API_URL) not configured');
        const page = req.page && req.page > 0 ? req.page : 1;
        const pageSize = req.pageSize && req.pageSize > 0 ? req.pageSize : 50;
        const skip = (page - 1) * pageSize;

        if (req.query && req.query.trim().length > 0) {
          // Simple text search
          const query = `
            query Search($q: String!, $limit: Int, $offset: Int, $orderBy: String, $orderDirection: String) {
              searchAgents(query: $q, limit: $limit, offset: $offset, orderBy: $orderBy, orderDirection: $orderDirection) {
                chainId
                agentId
                agentName
                agentOwner
                agentAddress
                description
                image
                a2aEndpoint
                ensEndpoint
                agentAccountEndpoint
                metadataURI
                createdAtBlock
                createdAtTime
                updatedAtTime
                supportedTrust
                rawJson
              }
            }
          `;
          const data = await graphqlFetch(gqlUrl, token, {
            query,
            variables: {
              q: req.query,
              limit: pageSize,
              offset: skip,
              orderBy: req.orderBy,
              orderDirection: req.orderDirection,
            },
          });
          const agents = data?.searchAgents ?? [];
          return {
            agents,
            total: agents.length,
            page,
            pageSize,
            totalPages: Math.max(1, Math.ceil((agents.length || 1) / pageSize)),
          };
        }

        // Graph-style advanced search
        const where: Record<string, any> = {};
        const p = req.params || {};
        if (p.id != null) where.agentId = String(p.id);
        if (p.agentId != null) where.agentId = String(p.agentId);
        if (Array.isArray(p.chains) && p.chains.length > 0 && p.chains !== 'all') where.chainId_in = p.chains;
        if (typeof p.name === 'string' && p.name.trim()) where.agentName_contains_nocase = p.name.trim();
        if (typeof p.description === 'string' && p.description.trim()) where.description_contains_nocase = p.description.trim();
        if (Array.isArray(p.owners) && p.owners.length > 0) where.agentOwner_in = p.owners.map((x: string) => x.toLowerCase());
        if (typeof p.a2a === 'boolean') where.hasA2aEndpoint = p.a2a;
        if (typeof p.ens === 'string' && p.ens.trim()) where.ensEndpoint_contains_nocase = p.ens.trim();
        if (typeof p.did === 'string' && p.did.trim()) where.did_contains_nocase = p.did.trim();
        if (typeof p.walletAddress === 'string' && p.walletAddress.trim()) where.agentAccountEndpoint_contains_nocase = p.walletAddress.trim();
        if (Array.isArray(p.supportedTrust) && p.supportedTrust.length > 0) where.supportedTrust_in = p.supportedTrust;
        if (Array.isArray(p.a2aSkills) && p.a2aSkills.length > 0) where.a2aSkills_in = p.a2aSkills;
        if (Array.isArray(p.mcpTools) && p.mcpTools.length > 0) where.mcpTools_in = p.mcpTools;
        if (Array.isArray(p.mcpPrompts) && p.mcpPrompts.length > 0) where.mcpPrompts_in = p.mcpPrompts;
        if (Array.isArray(p.mcpResources) && p.mcpResources.length > 0) where.mcpResources_in = p.mcpResources;
        if (typeof p.mcp === 'boolean') where.mcp = p.mcp;
        if (typeof p.x402support === 'boolean') where.x402support = p.x402support;
        if (typeof p.active === 'boolean') where.active = p.active;

        const graphQuery = `
          query SearchGraph($where: AgentWhereInput, $first: Int, $skip: Int, $orderBy: AgentOrderBy, $orderDirection: OrderDirection) {
            searchAgentsGraph(where: $where, first: $first, skip: $skip, orderBy: $orderBy, orderDirection: $orderDirection) {
              agents {
                chainId
                agentId
                agentName
                agentOwner
                agentAddress
                description
                image
                a2aEndpoint
                ensEndpoint
                agentAccountEndpoint
                metadataURI
                createdAtBlock
                createdAtTime
                updatedAtTime
                supportedTrust
                rawJson
              }
              total
              hasMore
            }
          }
        `;
        const data = await graphqlFetch(gqlUrl, token, {
          query: graphQuery,
          variables: {
            where,
            first: pageSize,
            skip,
            orderBy: req.orderBy,
            orderDirection: req.orderDirection,
          },
        });
        const result = data?.searchAgentsGraph ?? { agents: [], total: 0, hasMore: false };
        const total = typeof result.total === 'number' ? result.total : (result.agents?.length ?? 0);
        return {
          agents: result.agents ?? [],
          total,
          page,
          pageSize,
          totalPages: Math.max(1, Math.ceil((total || 1) / pageSize)),
        };
      },
    },
  };
}


