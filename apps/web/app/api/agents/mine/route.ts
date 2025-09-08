import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createPublicClient, createWalletClient, http, custom, keccak256, stringToHex } from 'viem';
import { sepolia } from 'viem/chains';
import { toMetaMaskSmartAccount, Implementation } from '@metamask/delegation-toolkit';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ownerAddress = (searchParams.get("owner") ?? "").trim();
    
    if (!ownerAddress) {
      return NextResponse.json({ error: "Owner address is required" }, { status: 400 });
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) {
      return NextResponse.json({ error: "Invalid address format" }, { status: 400 });
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
            ownedAgents.push({
              agentId: agent.agentId,
              agentAddress: agent.agentAddress,
              agentDomain: agent.agentDomain,
              metadataURI: agent.metadataURI,
              createdAtBlock: agent.createdAtBlock,
              createdAtTime: agent.createdAtTime,
              derivedAddress: derivedAddress
            });
          }
        } catch (error) {
          // Skip agents that fail ownership computation
          console.warn(`Failed to compute ownership for agent ${agent.agentId}:`, error);
        }
      }
    } catch (error) {
      console.error("Error in ownership computation:", error);
      return NextResponse.json({ error: "Failed to compute ownership" }, { status: 500 });
    }

    return NextResponse.json({
      owner: ownerAddress,
      totalOwned: ownedAgents.length,
      agents: ownedAgents,
      computedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Error in mine API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
