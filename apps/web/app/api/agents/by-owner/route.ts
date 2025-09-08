import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPublicClient, createWalletClient, http, custom, keccak256, stringToHex } from 'viem';
import { sepolia } from 'viem/chains';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';

// CORS headers for external API access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerAddress = (searchParams.get("owner") ?? "").trim();
    const includeEns = searchParams.get("includeEns") === "true";
    const format = (searchParams.get("format") ?? "json").toLowerCase();
    
    if (!ownerAddress) {
      return NextResponse.json(
        { error: "Owner address is required", code: "MISSING_OWNER" }, 
        { status: 400, headers: corsHeaders }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
      return NextResponse.json(
        { error: "Invalid address format", code: "INVALID_ADDRESS" }, 
        { status: 400, headers: corsHeaders }
      );
    }

    // Get all agents from database
    const allAgents = db.prepare(`
      SELECT agentId, agent as agentAddress, owner, domain as agentDomain, metadataURI, createdAtBlock, createdAtTime
      FROM agents
      ORDER BY agentId ASC
    `).all() as Array<{
      agentId: string;
      agentAddress: string;
      owner: string;
      agentDomain: string;
      metadataURI: string | null;
      createdAtBlock: number;
      createdAtTime: number;
    }>;

    // Compute ownership using the same logic as the frontend
    const ownedAgents = [];
    const rpcUrl = (process.env.NEXT_PUBLIC_RPC_URL as string) || 'https://rpc.ankr.com/eth_sepolia';
    
    try {
      const publicClient = createPublicClient({ 
        chain: sepolia, 
        transport: http(rpcUrl) 
      });

      // Create a mock wallet client for the owner address (we only need it for address derivation)
      const mockProvider = {
        request: async () => {
          throw new Error("Mock provider - not for actual transactions");
        }
      };
      
      const walletClient = createWalletClient({ 
        chain: sepolia as any, 
        transport: custom(mockProvider as any), 
        account: ownerAddress as `0x${string}` 
      });

      for (const agent of allAgents) {
        try {
          // Use the same salt generation logic as the frontend
          const salt = keccak256(stringToHex(agent.agentDomain.trim().toLowerCase()));
          
          const smartAccount = await toMetaMaskSmartAccount({
            client: publicClient,
            implementation: Implementation.Hybrid,
            deployParams: [ownerAddress as `0x${string}`, [], [], []],
            signatory: { walletClient },
            deploySalt: salt as `0x${string}`,
          } as any);
          
          const derivedAddress = (await smartAccount.getAddress()).toLowerCase();
          const isOwned = derivedAddress === agent.agentAddress.toLowerCase();
          
          if (isOwned) {
            const ownedAgent = {
              agentId: agent.agentId,
              agentAddress: agent.agentAddress,
              agentDomain: agent.agentDomain,
              metadataURI: agent.metadataURI,
              createdAtBlock: agent.createdAtBlock,
              createdAtTime: agent.createdAtTime,
              derivedAddress: derivedAddress
            };

            // Add ENS name if requested
            if (includeEns) {
              try {
                const { createEnsPublicClient } = await import('@ensdomains/ensjs');
                const ensClient = createEnsPublicClient({
                  chain: sepolia as any,
                  transport: http(rpcUrl),
                });
                
                const name = await ensClient.getName({
                  address: agent.agentAddress as `0x${string}`,
                });
                
                (ownedAgent as any).ensName = name?.name || null;
              } catch (error) {
                console.warn(`Failed to resolve ENS for ${agent.agentAddress}:`, error);
                (ownedAgent as any).ensName = null;
              }
            }

            ownedAgents.push(ownedAgent);
          }
        } catch (error) {
          // Skip agents that fail ownership computation
          console.warn(`Failed to compute ownership for agent ${agent.agentId}:`, error);
        }
      }
    } catch (error) {
      console.error("Error in ownership computation:", error);
      return NextResponse.json(
        { error: "Failed to compute ownership", code: "OWNERSHIP_COMPUTATION_ERROR" }, 
        { status: 500, headers: corsHeaders }
      );
    }

    const response = {
      success: true,
      owner: ownerAddress,
      totalOwned: ownedAgents.length,
      agents: ownedAgents,
      computedAt: new Date().toISOString(),
      chain: {
        id: sepolia.id,
        name: sepolia.name
      }
    };

    // Return in different formats based on request
    if (format === "csv") {
      const csvHeaders = "agentId,agentAddress,agentDomain,metadataURI,createdAtBlock,createdAtTime,derivedAddress" + 
        (includeEns ? ",ensName" : "");
      const csvRows = ownedAgents.map(agent => 
        `${agent.agentId},"${agent.agentAddress}","${agent.agentDomain}","${agent.metadataURI || ''}",${agent.createdAtBlock},${agent.createdAtTime},"${agent.derivedAddress}"` +
        (includeEns ? `,"${(agent as any).ensName || ''}"` : "")
      );
      const csv = [csvHeaders, ...csvRows].join('\n');
      
      return new NextResponse(csv, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="agents-${ownerAddress}-${Date.now()}.csv"`
        }
      });
    }

    return NextResponse.json(response, { status: 200, headers: corsHeaders });

  } catch (error) {
    console.error("Error in by-owner API:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" }, 
      { status: 500, headers: corsHeaders }
    );
  }
}
