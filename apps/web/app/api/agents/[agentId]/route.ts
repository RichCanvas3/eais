import { NextRequest, NextResponse } from 'next/server';
import { getIPFSStorage } from '@agentic-trust/core';
import { getAdminClient } from '@/lib/client';

export const dynamic = 'force-dynamic';

const DEFAULT_CHAIN_ID = 11155111;
const METADATA_KEYS = ['agentName', 'agentAccount'] as const;

type IdentityMetadata = {
  tokenURI: string | null;
  metadata: Record<string, string>;
};

type IdentityRegistration = {
  tokenURI: string;
  registration: any | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: { agentId: string } }
) {
  try {
    const { agentId } = params;
    if (!agentId) {
      return NextResponse.json(
        { error: 'Missing agentId parameter' },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const chainIdParam = searchParams.get('chainId');
    const chainId = chainIdParam ? Number.parseInt(chainIdParam, 10) : DEFAULT_CHAIN_ID;

    let agentIdBigInt: bigint;
    try {
      agentIdBigInt = BigInt(agentId);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Invalid agentId parameter',
          message: error instanceof Error ? error.message : 'Unable to parse agentId as bigint',
        },
        { status: 400 }
      );
    }

    const [client, identityClient] = await Promise.all([
      getAdminClient(),
      (async () => {
        const core = (await import('@agentic-trust/core/server')) as any;
        return core.getIdentityClient();
      })(),
    ]);

    let tokenURI: string | null = null;
    try {
      tokenURI = await identityClient.getTokenURI(agentIdBigInt);
    } catch (error) {
      console.warn('Failed to fetch tokenURI from identity client:', error);
    }

    const metadata: Record<string, string> = {};
    await Promise.all(
      METADATA_KEYS.map(async (key) => {
        try {
          const value = await identityClient.getMetadata(agentIdBigInt, key);
          if (value) {
            metadata[key] = value;
          }
        } catch (error) {
          console.warn(`Failed to get metadata key ${key}:`, error);
        }
      })
    );

    const identityMetadata: IdentityMetadata = {
      tokenURI,
      metadata,
    };

    let identityRegistration: IdentityRegistration | null = null;
    if (tokenURI) {
      try {
        const ipfsStorage = getIPFSStorage();
        const registration = await ipfsStorage.getJson(tokenURI);
        identityRegistration = {
          tokenURI,
          registration,
        };
      } catch (error) {
        console.warn('Failed to get IPFS registration:', error);
        identityRegistration = {
          tokenURI,
          registration: null,
        };
      }
    }

    let discovery: any | null = null;
    try {
      const rawDiscovery = await client.agents.getAgentFromGraphQL(chainId, agentId);
      if (rawDiscovery) {
        discovery = typeof rawDiscovery.toJSON === 'function' ? rawDiscovery.toJSON() : rawDiscovery;
      }
    } catch (error) {
      console.warn('Failed to get GraphQL agent data:', error);
    }

    const flattened: Record<string, any> = {};

    if (identityRegistration?.registration) {
      const reg = identityRegistration.registration;
      if (reg.name) flattened.name = reg.name;
      if (reg.description) flattened.description = reg.description;
      if (reg.image) flattened.image = reg.image;
      if (reg.agentAccount) flattened.agentAccount = reg.agentAccount;
      if (reg.endpoints) flattened.endpoints = reg.endpoints;
      if (reg.supportedTrust) flattened.supportedTrust = reg.supportedTrust;
      if (reg.createdAt) flattened.createdAt = reg.createdAt;
      if (reg.updatedAt) flattened.updatedAt = reg.updatedAt;
    }

    if (metadata.agentName) {
      if (!flattened.name) flattened.name = metadata.agentName;
      flattened.agentName = metadata.agentName;
    }
    if (metadata.agentAccount) {
      flattened.agentAccount = metadata.agentAccount;
    }

    if (discovery && typeof discovery === 'object') {
      Object.entries(discovery).forEach(([key, value]) => {
        if (key === 'agentId') return;
        if (value === undefined || value === null) return;
        if (!(key in flattened)) {
          flattened[key] = value;
        }
      });
    }

    if (!flattened.metadataURI && discovery?.metadataURI) {
      flattened.metadataURI = discovery.metadataURI;
    }
    if (!flattened.metadataURI && identityMetadata.tokenURI) {
      flattened.metadataURI = identityMetadata.tokenURI;
    }

    return NextResponse.json({
      success: true as const,
      agentId,
      chainId,
      identityMetadata,
      identityRegistration,
      discovery,
      ...flattened,
    });
  } catch (error) {
    console.error('Error in get agent info route:', error);
    return NextResponse.json(
      {
        error: 'Failed to get agent information',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
