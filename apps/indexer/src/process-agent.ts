/**
 * Shared function to process and index an agent directly from chain data
 * Works with both D1 adapter (Node.js) and native D1 (Cloudflare Workers)
 */

/**
 * Unified database update executor (handles both D1 adapter and native D1)
 */
async function executeUpdate(db: any, sql: string, params: any[]): Promise<void> {
  const stmt = db.prepare(sql);
  
  // Check if it's native D1 (has .bind method)
  if (stmt.bind && typeof stmt.bind === 'function') {
    // Native D1: use .bind().run()
    await stmt.bind(...params).run();
  } else {
    // D1 adapter: use .run(...params)
    await stmt.run(...params);
  }
}

/**
 * Process agent data directly from blockchain and upsert into database
 * @param ownerAddress - The owner address of the agent NFT
 * @param tokenId - The agent token ID (bigint)
 * @param blockNumber - Block number when the agent was created/transferred
 * @param tokenURI - The token URI for metadata
 * @param chainId - Chain ID (e.g., 11155111 for ETH Sepolia)
 * @param db - Database instance (D1 adapter or native D1)
 */
export async function processAgentDirectly(
  ownerAddress: string,
  tokenId: bigint,
  blockNumber: bigint,
  tokenURI: string | null,
  chainId: number,
  db: any
) {
  const agentId = tokenId.toString();
  const agentAddress = ownerAddress;
  let agentName = '';

  // Fetch metadata from tokenURI
  let preFetchedMetadata: any = null;
  let a2aEndpoint: string | null = null;
  
  if (tokenURI) {
    try {
      // Handle inline data URIs (base64 or URL-encoded JSON)
      if (tokenURI.startsWith('data:application/json')) {
        const commaIndex = tokenURI.indexOf(',');
        if (commaIndex !== -1) {
          const jsonData = tokenURI.substring(commaIndex + 1);
          try {
            if (tokenURI.startsWith('data:application/json;base64,')) {
              // Decode base64
              // Use atob if available (Workers), otherwise Buffer (Node.js)
              let decoded: string;
              if (typeof atob !== 'undefined') {
                decoded = atob(jsonData);
              } else {
                // Node.js environment
                const cryptoNode = await import('crypto');
                decoded = Buffer.from(jsonData, 'base64').toString('utf-8');
              }
              preFetchedMetadata = JSON.parse(decoded);
            } else {
              preFetchedMetadata = JSON.parse(decodeURIComponent(jsonData));
            }
          } catch {
            // Fallback: try parsing as-is
            preFetchedMetadata = JSON.parse(jsonData);
          }
        }
      } else {
        // Fetch from IPFS gateway or HTTP URL
        const cidMatch = tokenURI.match(/ipfs:\/\/([a-z0-9]+)/i) || tokenURI.match(/https?:\/\/([a-z0-9]+)\.ipfs\.[^\/]*/i);
        if (cidMatch) {
          const cid = cidMatch[1];
          const ipfsUrl = `https://${cid}.ipfs.w3s.link`;
          const resp = await fetch(ipfsUrl);
          if (resp?.ok) {
            preFetchedMetadata = await resp.json();
          }
        } else if (/^https?:\/\//i.test(tokenURI)) {
          const resp = await fetch(tokenURI);
          if (resp?.ok) {
            preFetchedMetadata = await resp.json();
          }
        }
      }
      
      if (preFetchedMetadata) {
        if (typeof preFetchedMetadata?.name === 'string' && preFetchedMetadata.name.trim()) {
          agentName = preFetchedMetadata.name.trim();
        }
        const endpoints = Array.isArray(preFetchedMetadata.endpoints) ? preFetchedMetadata.endpoints : [];
        const findEndpoint = (n: string) => {
          const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
          return e && typeof e.endpoint === 'string' ? e.endpoint : null;
        };
        a2aEndpoint = findEndpoint('A2A') || findEndpoint('a2a');
      }
    } catch (e) {
      console.warn('Failed to fetch metadata:', e);
    }
  }

  // Don't process if agent is burned
  if (ownerAddress !== '0x000000000000000000000000000000000000dEaD') {
    const currentTime = Math.floor(Date.now() / 1000);
    
    // Insert or update agent
    await executeUpdate(db, `
      INSERT INTO agents(chainId, agentId, agentAddress, agentOwner, agentName, metadataURI, a2aEndpoint, createdAtBlock, createdAtTime)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chainId, agentId) DO UPDATE SET
        agentAddress=CASE WHEN excluded.agentAddress IS NOT NULL AND excluded.agentAddress != '0x0000000000000000000000000000000000000000' THEN excluded.agentAddress ELSE agentAddress END,
        agentOwner=excluded.agentOwner,
        agentName=COALESCE(NULLIF(TRIM(excluded.agentName), ''), agentName),
        a2aEndpoint=COALESCE(excluded.a2aEndpoint, a2aEndpoint),
        metadataURI=COALESCE(excluded.metadataURI, metadataURI)
    `, [
      chainId,
      agentId,
      agentAddress,
      ownerAddress,
      agentName,
      tokenURI,
      a2aEndpoint,
      Number(blockNumber),
      currentTime,
    ]);

    // Update metadata fields if available
    if (preFetchedMetadata) {
      try {
        const meta = preFetchedMetadata;
        const type = typeof meta.type === 'string' ? meta.type : null;
        const name = typeof meta.name === 'string' ? meta.name : null;
        const description = typeof meta.description === 'string' ? meta.description : null;
        const image = meta.image == null ? null : String(meta.image);
        const endpoints = Array.isArray(meta.endpoints) ? meta.endpoints : [];
        const findEndpoint = (n: string) => {
          const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
          return e && typeof e.endpoint === 'string' ? e.endpoint : null;
        };
        const a2aEp = findEndpoint('A2A') || findEndpoint('a2a');
        const ensEndpoint = findEndpoint('ENS');
        let agentAccountEndpoint = findEndpoint('agentAccount');
        if (!agentAccountEndpoint || !/^eip155:/i.test(agentAccountEndpoint)) {
          agentAccountEndpoint = `eip155:${chainId}:${ownerAddress}`;
        }
        const supportedTrust = Array.isArray(meta.supportedTrust) ? meta.supportedTrust.map(String) : [];
        const updateTime = Math.floor(Date.now() / 1000);
        
        await executeUpdate(db, `
          UPDATE agents SET
            type = COALESCE(type, ?),
            agentName = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE agentName 
            END,
            agentAddress = CASE
              WHEN (agentAddress IS NULL OR agentAddress = '0x0000000000000000000000000000000000000000')
                   AND (? IS NOT NULL AND ? != '0x0000000000000000000000000000000000000000')
              THEN ?
              ELSE agentAddress
            END,
            description = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE description 
            END,
            image = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE image 
            END,
            a2aEndpoint = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE a2aEndpoint 
            END,
            ensEndpoint = CASE 
              WHEN ? IS NOT NULL AND ? != '' THEN ? 
              ELSE ensEndpoint 
            END,
            agentAccountEndpoint = COALESCE(?, agentAccountEndpoint),
            supportedTrust = COALESCE(?, supportedTrust),
            rawJson = COALESCE(?, rawJson),
            updatedAtTime = ?
          WHERE chainId = ? AND agentId = ?
        `, [
          type,
          name, name, name,
          agentAddress, agentAddress, agentAddress,
          description, description, description,
          image, image, image,
          a2aEp, a2aEp, a2aEp,
          ensEndpoint, ensEndpoint, ensEndpoint,
          agentAccountEndpoint,
          JSON.stringify(supportedTrust),
          JSON.stringify(meta),
          updateTime,
          chainId,
          agentId,
        ]);
      } catch (error) {
        console.warn('Error updating metadata:', error);
      }
    }
  }
}

