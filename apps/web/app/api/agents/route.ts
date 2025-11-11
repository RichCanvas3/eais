import { NextRequest, NextResponse } from 'next/server';
import type { DiscoverParams } from '@agentic-trust/core/server';
import { discoverAgents, type DiscoverRequest, type DiscoverResponse } from '@agentic-trust/core/server';
import { getAdminClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 50;

function toNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractAddressFromAccountEndpoint(endpoint?: string | null): string | undefined {
  if (!endpoint) return undefined;
  // Expected format: eip155:<chainId>:<address>
  const parts = endpoint.split(':');
  const maybe = parts[parts.length - 1];
  if (maybe && maybe.startsWith('0x') && maybe.length === 42) return maybe.toLowerCase();
  return undefined;
}

function mapAgentsResponse(data: DiscoverResponse) {
  const { agents, total, page, pageSize, totalPages } = data;
  const agentsData = agents.map((agent: any) => ({
    chainId: agent.data?.chainId ?? agent.chainId,
    agentId: agent.agentId,
    agentName: agent.agentName,
    agentOwner: agent.data?.agentOwner ?? agent.agentOwner,
    agentAccountEndpoint: agent.agentAccountEndpoint ?? agent.data?.agentAccountEndpoint,
    ensEndpoint: agent.ensEndpoint ?? agent.data?.ensEndpoint,
    a2aEndpoint: agent.a2aEndpoint ?? agent.data?.a2aEndpoint,
    // Derive address with fallbacks
    agentAddress:
      agent.agentAddress ??
      agent.data?.agentAddress ??
      extractAddressFromAccountEndpoint(agent.agentAccountEndpoint ?? agent.data?.agentAccountEndpoint) ??
      undefined,
    description: agent.data?.description ?? agent.description,
    image: agent.data?.image ?? agent.image,
    metadataURI: agent.data?.metadataURI ?? agent.metadataURI,
    createdAtBlock: agent.data?.createdAtBlock ?? agent.createdAtBlock,
    createdAtTime: agent.data?.createdAtTime ?? agent.createdAtTime,
    updatedAtTime: agent.data?.updatedAtTime ?? agent.updatedAtTime,
    supportedTrust: agent.data?.supportedTrust ?? agent.supportedTrust,
    rawJson: agent.data?.rawJson ?? agent.rawJson,
  }));

  return {
    rows: agentsData,
    total: total ?? agents.length,
    page: page ?? 1,
    pageSize: pageSize ?? agents.length,
    totalPages: totalPages ?? Math.max(1, Math.ceil((total ?? agents.length) / (pageSize ?? Math.max(agents.length, 1)))),
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

export async function GET(request: NextRequest) {
  try {
    const urlParams = request.nextUrl.searchParams;
    const page = toNumber(urlParams.get('page'));
    const pageSize = toNumber(urlParams.get('pageSize')) ?? DEFAULT_PAGE_SIZE;
    const query = urlParams.get('query')?.trim();
    const params = parseParamsParam(urlParams.get('params'));
    const name = urlParams.get('name')?.trim() || undefined;
    const id = urlParams.get('id')?.trim() || undefined;
    const address = urlParams.get('address')?.trim()?.toLowerCase() || undefined;
    const chainIdNum = toNumber(urlParams.get('chainId'));
    const orderBy = urlParams.get('orderBy')?.trim() || 'agentId';
    const orderDirectionRaw = urlParams.get('orderDirection')?.trim().toUpperCase();
    const orderDirection =
      orderDirectionRaw === 'ASC' || orderDirectionRaw === 'DESC' ? (orderDirectionRaw as 'ASC' | 'DESC') : 'DESC';

    // Merge legacy filters into discover params
    const mergedParams: any = { ...(params || {}) };
    if (name) mergedParams.name = name;
    if (id) mergedParams.id = id;
    if (address) mergedParams.owners = Array.isArray(mergedParams.owners) ? Array.from(new Set([...mergedParams.owners, address])) : [address];
    if (chainIdNum != null) {
      mergedParams.chains = Array.isArray(mergedParams.chains) ? Array.from(new Set([...mergedParams.chains, chainIdNum])) : [chainIdNum];
    }

    const response = await discoverAgents(
      {
        page,
        pageSize,
        query: query && query.length > 0 ? query : undefined,
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

    // Support legacy fields in body: name, id, address, chainId
    const mergedParams: any = { ...(params || {}) };
    if (typeof body.name === 'string' && body.name.trim()) mergedParams.name = body.name.trim();
    if (typeof body.id === 'string' && body.id.trim()) mergedParams.id = body.id.trim();
    if (typeof body.address === 'string' && body.address.trim()) {
      const addr = body.address.trim().toLowerCase();
      mergedParams.owners = Array.isArray(mergedParams.owners) ? Array.from(new Set([...mergedParams.owners, addr])) : [addr];
    }
    if (typeof body.chainId === 'number' && Number.isFinite(body.chainId)) {
      mergedParams.chains = Array.isArray(mergedParams.chains) ? Array.from(new Set([...mergedParams.chains, body.chainId])) : [body.chainId];
    }

    const response = await discoverAgents(
      {
        page,
        pageSize,
        query,
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
