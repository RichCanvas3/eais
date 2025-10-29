import { createPublicClient, http, type Address, type Chain } from "viem";
import { ethers } from 'ethers';
import { ValidationClient, EthersAdapter, ERC8004Client } from '@erc8004/sdk';
import { AIAgentENSClient, AIAgentIdentityClient, AIAgentReputationClient } from '@erc8004/agentic-trust-sdk';
import { sepolia } from 'viem/chains';
import { baseSepolia } from 'viem/chains';
import { optimismSepolia } from 'viem/chains';
import { 
  ETH_SEPOLIA_RPC_URL, BASE_SEPOLIA_RPC_URL, OP_SEPOLIA_RPC_URL,
  ETH_SEPOLIA_IDENTITY_REGISTRY, BASE_SEPOLIA_IDENTITY_REGISTRY, OP_SEPOLIA_IDENTITY_REGISTRY,
  ETH_SEPOLIA_REPUTATION_REGISTRY, BASE_SEPOLIA_REPUTATION_REGISTRY, OP_SEPOLIA_REPUTATION_REGISTRY,
  ETH_SEPOLIA_VALIDATION_REGISTRY, BASE_SEPOLIA_VALIDATION_REGISTRY, OP_SEPOLIA_VALIDATION_REGISTRY,
  ETH_SEPOLIA_GRAPHQL_URL, BASE_SEPOLIA_GRAPHQL_URL, OP_SEPOLIA_GRAPHQL_URL,
  VALIDATION_INTERVAL_MS, VALIDATION_BATCH_SIZE, GRAPHQL_API_KEY, GRAPHQL_POLL_MS
} from './env';

// Chain configurations
const CHAIN_CONFIGS = {
  11155111: { // ETH Sepolia
    chain: sepolia,
    rpcUrl: ETH_SEPOLIA_RPC_URL,
    identityRegistry: ETH_SEPOLIA_IDENTITY_REGISTRY,
    reputationRegistry: ETH_SEPOLIA_REPUTATION_REGISTRY,
    validationRegistry: ETH_SEPOLIA_VALIDATION_REGISTRY,
    graphqlUrl: ETH_SEPOLIA_GRAPHQL_URL,
    name: 'ETH Sepolia'
  },
  84532: { // Base Sepolia
    chain: baseSepolia,
    rpcUrl: BASE_SEPOLIA_RPC_URL,
    identityRegistry: BASE_SEPOLIA_IDENTITY_REGISTRY,
    reputationRegistry: BASE_SEPOLIA_REPUTATION_REGISTRY,
    validationRegistry: BASE_SEPOLIA_VALIDATION_REGISTRY,
    graphqlUrl: BASE_SEPOLIA_GRAPHQL_URL,
    name: 'Base Sepolia'
  },
  11155420: { // Optimism Sepolia
    chain: optimismSepolia,
    rpcUrl: OP_SEPOLIA_RPC_URL,
    identityRegistry: OP_SEPOLIA_IDENTITY_REGISTRY,
    reputationRegistry: OP_SEPOLIA_REPUTATION_REGISTRY,
    validationRegistry: OP_SEPOLIA_VALIDATION_REGISTRY,
    graphqlUrl: OP_SEPOLIA_GRAPHQL_URL,
    name: 'Optimism Sepolia'
  }
};

// Database functionality removed as requested by user

// ERC8004 client setup
function createERC8004Client(chainId: number, rpcUrl: string, identityRegistry: `0x${string}`, reputationRegistry: `0x${string}`, validationRegistry: `0x${string}`) {
  const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);
  const adapter = new EthersAdapter(ethersProvider);
  
  return new ERC8004Client({
    adapter,
    addresses: {
      identityRegistry,
      reputationRegistry,
      validationRegistry,
      chainId
    }
  });
}

// Validation client setup
function createValidationClient(chainId: number, rpcUrl: string, identityRegistry: `0x${string}`, validationRegistry: `0x${string}`) {
  const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);
  const adapter = new EthersAdapter(ethersProvider);
  
  return new ValidationClient(adapter, validationRegistry);
}

// Agentic trust SDK clients setup
function createAgenticClients(chainId: number, rpcUrl: string, identityRegistry: `0x${string}`, reputationRegistry: `0x${string}`) {
  const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);
  const adapter = new EthersAdapter(ethersProvider);
  const chain = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS].chain;

  // Create ENS client (using ETH Sepolia as default for ENS)
  const ensClient = new AIAgentENSClient(
    sepolia, // ENS is on ETH mainnet/sepolia
    ETH_SEPOLIA_RPC_URL,
    adapter,
    '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e', // ENS Registry
    '0x8FADE66B79cC9f707aB26799354482EB93a5B7dD', // ENS Resolver
    identityRegistry
  );

  // Create identity client
  const identityClient = new AIAgentIdentityClient(
    chainId,
    rpcUrl,
    identityRegistry
  );

  // Create reputation client
  const reputationClient = new AIAgentReputationClient(
    adapter,
    adapter,
    reputationRegistry,
    identityRegistry,
    '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e' // ENS Registry
  );

  return { ensClient, identityClient, reputationClient };
}

// GraphQL querying functions
async function fetchAgentsFromSubgraph(chainId: number): Promise<any[]> {
  const config = CHAIN_CONFIGS[chainId as keyof typeof CHAIN_CONFIGS];
  if (!config.graphqlUrl) {
    console.warn(`⚠️  No GraphQL URL configured for chain ${config.name}`);
    return [];
  }

  console.log(`🔍 Fetching agents from subgraph: ${config.name}`);

  const fetchJson = async (body: any) => {
    const endpoint = config.graphqlUrl;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (GRAPHQL_API_KEY) {
      headers['Authorization'] = `Bearer ${GRAPHQL_API_KEY}`;
    }

    const res = await fetch(endpoint, { 
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    
    if (!res.ok) {
      throw new Error(`GraphQL request failed: ${res.status} ${res.statusText}`);
    }
    
    return res.json();
  };

  try {
    // Query for tokens (agents) from the subgraph
    const query = `query GetAgents($first: Int!) {
      tokens(first: $first, orderBy: mintedAt, orderDirection: desc) {
        id
        uri
        agentName
        description
        image
        a2aEndpoint
        ensName
        agentAccount
        metadataJson
        mintedAt
        owner {
          id
        }
      }
    }`;

    const response = await fetchJson({ 
      query, 
      variables: { first: 500 } 
    });

    const agents = response?.data?.tokens || [];
    console.log(`📊 Found ${agents.length} agents from ${config.name} subgraph`);
    
    return agents;
  } catch (error) {
    console.error(`❌ Error fetching agents from ${config.name} subgraph:`, error);
    return [];
  }
}

// Helper functions for reading registration data from NFT URI (from indexer approach)
async function tryReadTokenURI(client: ERC8004Client, tokenId: bigint): Promise<string | null> {
  try {
    const uri = await client.identity.getTokenURI(tokenId);
    return uri ?? null;
  } catch {
    return null;
  }
}

function extractCid(tokenURI: string): string | null {
  try {
    if (tokenURI.startsWith('ipfs://')) {
      const rest = tokenURI.slice('ipfs://'.length);
      const cid = rest.split('/')[0]?.trim();
      return cid || null;
    }
    const m = tokenURI.match(/https?:\/\/([a-z0-9]+)\.ipfs\.[^\/]*/i);
    if (m && m[1]) return m[1];
  } catch {}
  return null;
}

async function fetchIpfsJson(tokenURI: string | null): Promise<any | null> {
  if (!tokenURI) return null;
  const fetchFn = (globalThis as any).fetch as undefined | ((input: any, init?: any) => Promise<any>);
  if (!fetchFn) return null;
  try {
    console.info("🔍 fetchIpfsJson: tokenURI: ", tokenURI);
    
    // Handle inline data URIs (data:application/json,...)
    if (tokenURI.startsWith('data:application/json')) {
      try {
        const commaIndex = tokenURI.indexOf(',');
        if (commaIndex === -1) {
          console.warn("🔍 fetchIpfsJson: Invalid data URI format");
          return null;
        }
        
        const jsonData = tokenURI.substring(commaIndex + 1);
        let parsed;
        
        // Check if it's marked as base64 encoded
        if (tokenURI.startsWith('data:application/json;base64,')) {
          try {
            // Try base64 decode first
            const jsonString = Buffer.from(jsonData, 'base64').toString('utf-8');
            parsed = JSON.parse(jsonString);
          } catch (e) {
            // If base64 fails, try parsing as plain JSON (some URIs are mislabeled)
            console.info("🔍 fetchIpfsJson: base64 decode failed, trying plain JSON");
            try {
              parsed = JSON.parse(jsonData);
            } catch (e2) {
              const decodedJson = decodeURIComponent(jsonData);
              parsed = JSON.parse(decodedJson);
            }
          }
        } else {
          // Plain JSON - try parsing directly first, then URL decode if needed
          try {
            parsed = JSON.parse(jsonData);
          } catch (e) {
            const decodedJson = decodeURIComponent(jsonData);
            parsed = JSON.parse(decodedJson);
          }
        }
        
        console.info("🔍 fetchIpfsJson: parsed inline data:", parsed);
        return parsed;
      } catch (e) {
        console.warn("🔍 fetchIpfsJson: Failed to parse inline data URI:", e);
        return null;
      }
    }
    
    // Handle plain JSON strings (like the web project does)
    if (tokenURI.trim().startsWith('{') && tokenURI.trim().endsWith('}')) {
      try {
        console.info("🔍 fetchIpfsJson: tokenURI is plain JSON:", tokenURI);
        const parsed = JSON.parse(tokenURI);
        console.info("🔍 fetchIpfsJson: parsed plain JSON:", parsed);
        return parsed;
      } catch (e) {
        console.warn("🔍 fetchIpfsJson: Failed to parse plain JSON:", e);
        return null;
      }
    }
    
    const cid = extractCid(tokenURI);
    if (cid) {
      console.info("🔍 fetchIpfsJson: cid: ", cid);
      // Try to fetch from IPFS gateway (you may need to configure IDENTITY_API_URL)
      const IDENTITY_API_URL = process.env.IDENTITY_API_URL || 'https://api.web3.storage';
      const resp = await fetchFn(`${IDENTITY_API_URL}/api/web3storage/download/${cid}`);
      if (resp?.ok) {
        const json = await resp.json();
        console.info("🔍 fetchIpfsJson: json: ", JSON.stringify(json?.data));
        return json?.data ?? null;
      }
    }
    if (/^https?:\/\//i.test(tokenURI)) {
      const resp = await fetchFn(tokenURI);
      if (resp?.ok) return await resp.json();
    }
  } catch {}
  return null;
}

// New function to read registration data from NFT URI and print a2a endpoint
async function readAgentRegistrationData(
  erc8004Client: ERC8004Client, 
  agentId: bigint, 
  agentName: string,
  chainId: number,
  chainName: string,
  a2aEndpoints: Array<{
    chainId: number;
    chainName: string;
    agentId: string;
    agentName: string;
    a2aEndpoint: string;
    a2aContent?: any;
    error?: string;
  }>
): Promise<void> {
  try {
    console.log(`📋 Reading registration data for agent ${agentId.toString()}`);
    
    // Get token URI
    const tokenURI = await tryReadTokenURI(erc8004Client, agentId);
    if (!tokenURI) {
      console.log(`⚠️  No token URI found for agent ${agentId.toString()}`);
      return;
    }
    
    console.log(`🔗 Token URI: ${tokenURI}`);
    
    // Fetch metadata from URI
    const metadata = await fetchIpfsJson(tokenURI);
    if (!metadata) {
      console.log(`⚠️  Could not fetch metadata from URI for agent ${agentId.toString()}`);
      return;
    }
    
    console.log(`📄 Registration metadata:`, JSON.stringify(metadata, null, 2));
    
    // Extract a2a endpoint
    let a2aEndpoint: string | null = null;
    if (metadata && typeof metadata === 'object') {
      const endpoints = Array.isArray(metadata.endpoints) ? metadata.endpoints : [];
      const findEndpoint = (n: string) => {
        const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
        return e && typeof e.endpoint === 'string' ? e.endpoint : null;
      };
      a2aEndpoint = findEndpoint('a2a'); // Look for "a2a" specifically
    }
    
    if (a2aEndpoint) {
      console.log(`🎯 A2A Endpoint: ${a2aEndpoint}`);
      
      // Try to read the A2A endpoint content
      try {
        console.log(`📡 Attempting to fetch A2A endpoint content...`);
        const response = await fetch(a2aEndpoint);
        
        if (response.ok) {
          const a2aContent = await response.json();
          console.log(`✅ A2A Endpoint Response:`, JSON.stringify(a2aContent, null, 2));
          
          // Add to A2A endpoints array
          a2aEndpoints.push({
            chainId,
            chainName,
            agentId: agentId.toString(),
            agentName,
            a2aEndpoint,
            a2aContent
          });
        } else {
          console.log(`❌ A2A Endpoint HTTP Error: ${response.status} ${response.statusText}`);
          
          // Add to A2A endpoints array with error
          a2aEndpoints.push({
            chainId,
            chainName,
            agentId: agentId.toString(),
            agentName,
            a2aEndpoint,
            error: `HTTP ${response.status}: ${response.statusText}`
          });
        }
      } catch (fetchError) {
        const errorMsg = fetchError instanceof Error ? fetchError.message : 'Unknown error';
        console.log(`❌ Failed to fetch A2A endpoint:`, errorMsg);
        
        // Add to A2A endpoints array with error
        a2aEndpoints.push({
          chainId,
          chainName,
          agentId: agentId.toString(),
          agentName,
          a2aEndpoint,
          error: errorMsg
        });
      }
    } else {
      console.log(`⚠️  No A2A endpoint found in registration data for agent ${agentId.toString()}`);
      
      // Show available endpoints for debugging
      if (metadata && typeof metadata === 'object' && Array.isArray(metadata.endpoints)) {
        console.log(`📋 Available endpoints:`, metadata.endpoints.map((ep: any) => `${ep.name}: ${ep.endpoint}`).join(', '));
      }
    }
    
  } catch (error) {
    console.error(`❌ Error reading registration data for agent ${agentId.toString()}:`, error);
  }
}






// Main validation loop
async function runValidationCycle() {
  console.log('🚀 Starting validation cycle...');
  
  // Array to collect all A2A endpoints found
  const a2aEndpoints: Array<{
    chainId: number;
    chainName: string;
    agentId: string;
    agentName: string;
    a2aEndpoint: string;
    a2aContent?: any;
    error?: string;
  }> = [];
  
  for (const [chainIdStr, config] of Object.entries(CHAIN_CONFIGS)) {
    const chainId = parseInt(chainIdStr);
    console.log(`\n📡 Validating chain: ${config.name} (${chainId})`);
    
    try {
      // Create clients
      const erc8004Client = createERC8004Client(chainId, config.rpcUrl, config.identityRegistry, config.reputationRegistry, config.validationRegistry);
      const validationClient = createValidationClient(chainId, config.rpcUrl, config.identityRegistry, config.validationRegistry);
      const { ensClient, identityClient, reputationClient } = createAgenticClients(
        chainId, 
        config.rpcUrl, 
        config.identityRegistry, 
        config.reputationRegistry
      );

      // Fetch agents from subgraph
      const agentsFromSubgraph = await fetchAgentsFromSubgraph(chainId);
      
      if (agentsFromSubgraph.length === 0) {
        console.log(`⚠️  No agents found in subgraph for chain ${config.name}`);
        continue;
      }

      console.log(`🔍 Validating ${agentsFromSubgraph.length} agents from ${config.name} subgraph`);

      // Validate each agent from subgraph
      for (const agent of agentsFromSubgraph) {
        const agentId = BigInt(agent.id);
        const agentAddress = agent.agentAccount as `0x${string}`;
        const ensName = agent.ensName;

      
        try {
          console.log(`\n🔍 Validating agent ${agentId.toString()} (${agent.agentName || 'unnamed'})`);

          // Read registration data from NFT URI and print a2a endpoint
          await readAgentRegistrationData(erc8004Client, agentId, agent.agentName || 'unnamed', chainId, config.name, a2aEndpoints);

        } catch (error) {
          console.error(`❌ Error validating agent ${agentId.toString()}:`, error);
        }
      

        // Small delay to avoid overwhelming the RPC
        await new Promise(resolve => setTimeout(resolve, 200));
      }

    } catch (error) {
      console.error(`❌ Error validating chain ${config.name}:`, error);
    }
  }

  console.log('✅ Validation cycle completed');
  
  // Display A2A endpoints summary
  console.log('\n🎯 A2A Endpoints Summary:');
  console.log('=' .repeat(50));
  
  if (a2aEndpoints.length === 0) {
    console.log('No A2A endpoints found across all chains.');
  } else {
    console.log(`Found ${a2aEndpoints.length} A2A endpoints:`);
    console.log('');
    
    a2aEndpoints.forEach((endpoint, index) => {
      console.log(`${index + 1}. Chain: ${endpoint.chainName} (${endpoint.chainId})`);
      console.log(`   Agent: ${endpoint.agentName} (ID: ${endpoint.agentId})`);
      console.log(`   Endpoint: ${endpoint.a2aEndpoint}`);
      
      if (endpoint.error) {
        console.log(`   Status: ❌ Error - ${endpoint.error}`);
      } else {
        console.log(`   Status: ✅ Success`);
        if (endpoint.a2aContent) {
          console.log(`   Content Preview:`, JSON.stringify(endpoint.a2aContent, null, 2).substring(0, 200) + '...');
        }
      }
      console.log('');
    });
  }
  
  console.log('=' .repeat(50));
}

// Main function
async function main() {
  console.log('🎯 ERC8004 Validator Application Starting...');
  console.log(`⏰ Validation interval: ${VALIDATION_INTERVAL_MS}ms`);
  console.log(`📦 Batch size: ${VALIDATION_BATCH_SIZE}`);
  
  // Run initial validation
  await runValidationCycle();

  console.log('🔄 Validator running continuously...');
  console.log('Press Ctrl+C to stop');
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down validator...');
  process.exit(0);
});

// Start the application
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
