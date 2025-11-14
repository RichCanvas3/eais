import { NextRequest, NextResponse } from 'next/server';
import type { Address } from 'viem';
import type { DiscoverParams, DiscoverResponse } from '@agentic-trust/core/server';
import { discoverAgents, type DiscoverRequest } from '@agentic-trust/core/server';
import { getAdminClient } from '@/lib/server/adminClient';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 50;

function toNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapAgentsResponse(data: DiscoverResponse) {
  const { agents = [], total, page, pageSize, totalPages } = data;

  return {
    rows: agents.map((agent: any) => ({
      // Ensure backward-compatible shape for frontend AgentTable
      ...agent,
      // Provide agentAddress for legacy UI, preferring agentAccount then agentOwner
      agentAddress: agent.agentAccount || '',
    })),
    total: total ?? agents.length,
    page: page ?? 1,
    pageSize: pageSize ?? agents.length,
    totalPages:
      totalPages ?? Math.max(1, Math.ceil((total ?? agents.length) / (pageSize ?? Math.max(agents.length, 1)))),
  };
}

function parseParamsParam(raw: string | null): DiscoverParams | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as unknown as DiscoverParams) : undefined;
  } catch {
    return undefined;
  }
}

function toAddress(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith('0x') && normalized.length === 42 ? (normalized as Address) : undefined;
}

export async function GET(request: NextRequest) {
  try {
    const urlParams = request.nextUrl.searchParams;
    const page = toNumber(urlParams.get('page'));
    const pageSize = toNumber(urlParams.get('pageSize')) ?? DEFAULT_PAGE_SIZE;
    const query = urlParams.get('query')?.trim();
    const params = parseParamsParam(urlParams.get('params'));
    const name = urlParams.get('name')?.trim() || undefined;
    const id = urlParams.get('id')?.trim() || undefined;
    const address = toAddress(urlParams.get('address') || undefined);
    const chainIdNum = toNumber(urlParams.get('chainId'));
    const orderBy = urlParams.get('orderBy')?.trim() || 'agentId';
    const orderDirectionRaw = urlParams.get('orderDirection')?.trim().toUpperCase();
    const orderDirection =
      orderDirectionRaw === 'ASC' || orderDirectionRaw === 'DESC' ? (orderDirectionRaw as 'ASC' | 'DESC') : 'DESC';

    const mergedParams: DiscoverParams = { ...(params || {}) };
    // DiscoverParams in newer @agentic-trust/core uses agentName / agentAccount
    if (name) {
      // Prefer agentName for indexed name-based discovery
      (mergedParams as any).agentName = name;
    }
    if (id) {
      // Hint advanced discovery/indexer to treat this as an agentId filter
      (mergedParams as any).agentId = id;
    }
    if (address) {
      // Prefer agentAccount for address-based discovery; keep owners if still supported
      (mergedParams as any).agentAccount = address;
      if (Array.isArray((mergedParams as any).owners)) {
        (mergedParams as any).owners = Array.from(
          new Set([...(mergedParams as any).owners, address])
        );
      }
    }
    if (chainIdNum != null) {
      mergedParams.chains = Array.isArray(mergedParams.chains)
        ? Array.from(new Set([...mergedParams.chains, chainIdNum]))
        : [chainIdNum];
    }

    // If there are no concrete filters and no explicit params, hint advanced discovery
    // to use the GraphQL indexer with chains: 'all' so it does backend DESC pagination.
    const hasConcreteFilters =
      (id && id.length > 0) ||
      (name && name.length > 0) ||
      (address && String(address).length > 0) ||
      chainIdNum != null ||
      (query && query.length > 0);
    if (!hasConcreteFilters && !params) {
      mergedParams.chains = 'all';
    }

    console.log(' orderBy: ', orderBy);
    console.log(' orderDirection: ', orderDirection);
    console.log('>>>>>>>>>>>>>>>>>>>>> mergedParams', mergedParams);
    const response = await discoverAgents(
      {
        page,
        pageSize,
        query: id ?? (query && query.length > 0 ? query : undefined),
        params: mergedParams,
        orderBy,
        orderDirection,
      } satisfies DiscoverRequest,
      getAdminClient
    );
    console.log('>>>>>>>>>>>>>>>>>>>>>>> response length: ', response.agents.length);

    return NextResponse.json(mapAgentsResponse(response));
  } catch (error: unknown) {
    console.error('Error searching agents:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: 'Failed to search agents',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const page = typeof body.page === 'number' ? body.page : undefined;
    const pageSize =
      typeof body.pageSize === 'number' && Number.isFinite(body.pageSize) ? body.pageSize : DEFAULT_PAGE_SIZE;
    const query = typeof body.query === 'string' && body.query.trim().length > 0 ? body.query.trim() : undefined;
    const params: DiscoverParams | undefined =
      body.params && typeof body.params === 'object' ? (body.params as DiscoverParams) : undefined;
    const orderBy: string | undefined =
      typeof body.orderBy === 'string' && body.orderBy.trim().length > 0 ? body.orderBy.trim() : undefined;
    const orderDirection: 'ASC' | 'DESC' | undefined =
      typeof body.orderDirection === 'string' && ['ASC', 'DESC'].includes(body.orderDirection.toUpperCase())
        ? (body.orderDirection.toUpperCase() as 'ASC' | 'DESC')
        : undefined;

    const mergedParams: DiscoverParams = { ...(params || {}) };
    if (typeof body.name === 'string' && body.name.trim()) {
      (mergedParams as any).agentName = body.name.trim();
    }
    if (typeof body.id === 'string' && body.id.trim()) {
      (mergedParams as any).agentId = body.id.trim();
    }
    if (typeof body.address === 'string' && body.address.trim()) {
      const addr = toAddress(body.address.trim());
      if (addr) {
        (mergedParams as any).agentAccount = addr;
        if (Array.isArray((mergedParams as any).owners)) {
          (mergedParams as any).owners = Array.from(
            new Set([...(mergedParams as any).owners, addr])
          );
        }
      }
    }
    if (typeof body.chainId === 'number' && Number.isFinite(body.chainId)) {
      mergedParams.chains = Array.isArray(mergedParams.chains)
        ? Array.from(new Set([...mergedParams.chains, body.chainId]))
        : [body.chainId];
    }

    const response = await discoverAgents(
      {
        page,
        pageSize,
        query: typeof body.id === 'string' && body.id.trim().length > 0 ? body.id.trim() : query,
        params: mergedParams,
        orderBy,
        orderDirection,
      } satisfies DiscoverRequest,
      getAdminClient
    );

    return NextResponse.json(mapAgentsResponse(response));
  } catch (error: unknown) {
    console.error('Error searching agents:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json(
      {
        error: 'Failed to search agents',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}
