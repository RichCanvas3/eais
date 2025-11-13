import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { getIPFSStorage } from '@agentic-trust/core';
import { getAdminClient } from '@/lib/client';

const DEFAULT_CHAIN_ID = 11155111;
const METADATA_KEYS = ['agentName', 'agentAccount'] as const;

export const dynamic = 'force-dynamic';

type IdentityMetadata = {
  tokenURI: string | null;
  metadata: Record<string, string>;
};

type IdentityRegistration = {
  tokenURI: string;
  registration: any | null;
};

async function getIdentityClient() {
  const core = (await import('@agentic-trust/core/server')) as any;
  return core.getIdentityClient();
}

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const rawAddress = params.address;
    if (!rawAddress) {
      return NextResponse.json({ error: 'Missing address parameter' }, { status: 400 });
    }

    let address: string;
    try {
      address = getAddress(rawAddress);
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Invalid address parameter',
          message: error instanceof Error ? error.message : 'Unable to parse address',
        },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const chainIdParam = searchParams.get('chainId');
    const chainIdFilter = chainIdParam ? Number.parseInt(chainIdParam, 10) : undefined;

    const client = await getAdminClient();

    let discovery: any | null = null;
    try {
      const result = await client.agents.searchAgents({
        params: {
          walletAddress: address,
          chains: chainIdFilter ? [chainIdFilter] : undefined,
        },
        page: 1,
        pageSize: 1,
      });
      const agent = result?.agents?.[0];
      if (agent) {
        discovery = typeof agent.toJSON === 'function' ? agent.toJSON() : agent;
      }
    } catch (error) {
      console.warn('Failed to discover agent by address:', error);
    }

    if (!discovery) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const agentId = discovery.agentId ? String(discovery.agentId) : null;
    const chainId = chainIdFilter ?? discovery.chainId ?? DEFAULT_CHAIN_ID;

    let identityMetadata: IdentityMetadata | null = null;
    let identityRegistration: IdentityRegistration | null = null;

    if (agentId) {
      try {
        const identityClient = await getIdentityClient();
        const agentIdBigInt = BigInt(agentId);

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
              if (value) metadata[key] = value;
            } catch (error) {
              console.warn(`Failed to get metadata key ${key}:`, error);
            }
          })
        );

        identityMetadata = {
          tokenURI,
          metadata,
        };

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
      } catch (error) {
        console.warn('Failed to fetch identity metadata for address:', error);
      }
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

    if (identityMetadata?.metadata.agentName) {
      if (!flattened.name) flattened.name = identityMetadata.metadata.agentName;
      flattened.agentName = identityMetadata.metadata.agentName;
    }
    if (identityMetadata?.metadata.agentAccount) {
      flattened.agentAccount = identityMetadata.metadata.agentAccount;
    }

    if (discovery && typeof discovery === 'object') {
      Object.entries(discovery).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (!(key in flattened)) {
          flattened[key] = value;
        }
      });
    }

    if (!flattened.metadataURI) {
      flattened.metadataURI = identityMetadata?.tokenURI ?? discovery.metadataURI ?? null;
    }

    return NextResponse.json({
      success: true as const,
      address,
      agentId,
      chainId,
      identityMetadata,
      identityRegistration,
      discovery,
      ...flattened,
    });
  } catch (error) {
    console.error('Error in get agent by address route:', error);
    return NextResponse.json(
      {
        error: 'Failed to get agent information by address',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
