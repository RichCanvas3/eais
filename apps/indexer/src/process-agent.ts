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
 * Extract CID from IPFS URI (supports ipfs:// and https://...ipfs... formats)
 */
function extractCid(tokenURI: string): string | null {
  try {
    if (tokenURI.startsWith('ipfs://')) {
      const rest = tokenURI.slice('ipfs://'.length);
      const cid = rest.split('/')[0]?.trim();
      return cid || null;
    }
    
    // Try subdomain format: https://CID.ipfs.gateway.com (Web3Storage, Pinata subdomain)
    const subdomainMatch = tokenURI.match(/https?:\/\/([a-zA-Z0-9]{46,})\.ipfs\.[^\/\s]*/i);
    if (subdomainMatch && subdomainMatch[1]) {
      return subdomainMatch[1];
    }
    
    // Try path format: https://gateway.com/ipfs/CID (Pinata, IPFS.io, etc.)
    const pathMatch = tokenURI.match(/https?:\/\/[^\/]+\/ipfs\/([a-zA-Z0-9]{46,})/i);
    if (pathMatch && pathMatch[1]) {
      return pathMatch[1];
    }
    
    // Fallback: try to match any CID-like pattern (Qm... or bafy...)
    const cidMatch = tokenURI.match(/(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z0-9]{56})/i);
    if (cidMatch && cidMatch[1]) {
      return cidMatch[1];
    }
  } catch {}
  return null;
}

/**
 * Create an AbortSignal with timeout (compatible with both Node.js and Workers)
 */
function createTimeoutSignal(timeoutMs: number): AbortSignal {
  // Try AbortSignal.timeout if available (Node.js 17.3+, modern browsers)
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return (AbortSignal as any).timeout(timeoutMs);
  }
  
  // Fallback: create manual AbortController
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // Note: We can't clear the timeout on success in Workers, but that's okay
  // The timeout will just fire and abort, but the promise should already be resolved
  return controller.signal;
}

/**
 * Improved token URI parser with better error handling and fallbacks
 */
async function fetchIpfsJson(tokenURI: string | null): Promise<any | null> {
  if (!tokenURI) return null;
  const fetchFn = (globalThis as any).fetch as undefined | ((input: any, init?: any) => Promise<any>);
  if (!fetchFn) return null;
  try {
    console.info("............fetchIpfsJson: tokenURI: ", tokenURI)
    
    // Handle inline data URIs (data:application/json,...)
    if (tokenURI.startsWith('data:application/json')) {
      try {
        const commaIndex = tokenURI.indexOf(',');
        if (commaIndex === -1) {
          console.warn("............fetchIpfsJson: Invalid data URI format");
          return null;
        }
        
        const jsonData = tokenURI.substring(commaIndex + 1);
        let parsed;
        
        // Check if it's marked as base64 encoded
        if (tokenURI.startsWith('data:application/json;base64,')) {
          try {
            // Try base64 decode first (use atob for compatibility with Workers)
            let jsonString: string;
            if (typeof atob !== 'undefined') {
              jsonString = atob(jsonData);
            } else {
              // Node.js environment
              const cryptoNode = await import('crypto');
              jsonString = Buffer.from(jsonData, 'base64').toString('utf-8');
            }
            parsed = JSON.parse(jsonString);
          } catch (e) {
            // If base64 fails, try parsing as plain JSON (some URIs are mislabeled)
            console.info("............fetchIpfsJson: base64 decode failed, trying plain JSON");
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
        
        console.info("............fetchIpfsJson: parsed inline data:", parsed);
        return parsed;
      } catch (e) {
        console.warn("............fetchIpfsJson: Failed to parse inline data URI:", e);
        return null;
      }
    }
    
    const cid = extractCid(tokenURI);
    if (cid) {
      console.info("............fetchIpfsJson: cid: ", cid)
      
      // Detect if URI suggests a specific service (from URL format)
      const isPinataUrl = tokenURI.includes('pinata') || tokenURI.includes('gateway.pinata.cloud');
      const isWeb3StorageUrl = tokenURI.includes('w3s.link') || tokenURI.includes('web3.storage');
      
      // Try multiple IPFS gateways as fallbacks
      // Prioritize based on detected service, then try all options
      const gateways: Array<{ url: string; service: string }> = [];
      
      // Pinata gateways (try first if detected as Pinata, otherwise after Web3Storage)
      const pinataGateways = [
        { url: `https://gateway.pinata.cloud/ipfs/${cid}`, service: 'Pinata (gateway.pinata.cloud)' },
        { url: `https://${cid}.ipfs.mypinata.cloud`, service: 'Pinata (mypinata.cloud subdomain)' },
      ];
      
      // Web3Storage gateways (try first if detected as Web3Storage, otherwise try early)
      const web3StorageGateways = [
        { url: `https://${cid}.ipfs.w3s.link`, service: 'Web3Storage (w3s.link)' },
        { url: `https://w3s.link/ipfs/${cid}`, service: 'Web3Storage (w3s.link path)' },
      ];
      
      // Public IPFS gateways (fallbacks)
      const publicGateways = [
        { url: `https://ipfs.io/ipfs/${cid}`, service: 'IPFS.io' },
        { url: `https://cloudflare-ipfs.com/ipfs/${cid}`, service: 'Cloudflare IPFS' },
        { url: `https://dweb.link/ipfs/${cid}`, service: 'Protocol Labs (dweb.link)' },
        { url: `https://gateway.ipfs.io/ipfs/${cid}`, service: 'IPFS Gateway' },
      ];
      
      // Build gateway list with priority based on detection
      if (isPinataUrl) {
        // Pinata detected: try Pinata first, then Web3Storage, then public
        gateways.push(...pinataGateways, ...web3StorageGateways, ...publicGateways);
      } else if (isWeb3StorageUrl) {
        // Web3Storage detected: try Web3Storage first, then Pinata, then public
        gateways.push(...web3StorageGateways, ...pinataGateways, ...publicGateways);
      } else {
        // No detection: try Web3Storage first (most common), then Pinata, then public
        gateways.push(...web3StorageGateways, ...pinataGateways, ...publicGateways);
      }
      
      for (const { url: ipfsUrl, service } of gateways) {
        try {
          console.info(`............fetchIpfsJson: trying ${service}: ${ipfsUrl}`)
          const timeoutSignal = createTimeoutSignal(10000); // 10 second timeout per gateway
          const resp = await fetchFn(ipfsUrl, { 
            signal: timeoutSignal
          });
          if (resp?.ok) {
            const json = await resp.json();
            console.info(`............fetchIpfsJson: ✅ success from ${service}, json:`, JSON.stringify(json))
            return json ?? null;
          } else {
            console.info(`............fetchIpfsJson: ${service} returned status ${resp.status}, trying next gateway`)
          }
        } catch (e: any) {
          const errorMsg = e?.message || String(e);
          // Don't log timeout errors for every gateway (too noisy)
          if (!errorMsg.includes('aborted') && !errorMsg.includes('timeout')) {
            console.info(`............fetchIpfsJson: ${service} failed: ${errorMsg}, trying next gateway`)
          }
          // Continue to next gateway
          continue;
        }
      }
      
      console.warn(`............fetchIpfsJson: ❌ all IPFS gateways failed for CID: ${cid}`)
    }
    if (/^https?:\/\//i.test(tokenURI)) {
      const resp = await fetchFn(tokenURI);
      if (resp?.ok) return await resp.json();
    }
  } catch (e) {
    console.warn("............fetchIpfsJson: Error fetching/parsing token URI:", e);
  }
  return null;
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

  // Fetch metadata from tokenURI using improved parser
  let preFetchedMetadata: any = null;
  let a2aEndpoint: string | null = null;
  let description: string | null = null;
  let image: string | null = null;
  
  if (tokenURI) {
    try {
      preFetchedMetadata = await fetchIpfsJson(tokenURI);
      console.info("............process-agent: preFetchedMetadata: ", preFetchedMetadata)
      if (preFetchedMetadata) {
        if (typeof preFetchedMetadata?.name === 'string' && preFetchedMetadata.name.trim()) {
          console.log('********************* process-agent: name', preFetchedMetadata.name);
          agentName = preFetchedMetadata.name.trim();
        }
        if (typeof preFetchedMetadata?.description === 'string' && preFetchedMetadata.description.trim()) {
          description = preFetchedMetadata.description.trim();
        }
        if (preFetchedMetadata?.image != null) {
          image = String(preFetchedMetadata.image);
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
    console.log('********************* process-agent: inserting or updating agent: ', agentId, agentAddress, ownerAddress, agentName, tokenURI, a2aEndpoint, blockNumber, currentTime);
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
        // Use pre-extracted description and image, or extract from metadata if not already extracted
        const desc = description || (typeof meta.description === 'string' ? meta.description : null);
        const img = image || (meta.image == null ? null : String(meta.image));
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
        const did = typeof meta.did === 'string' ? meta.did : null;
        const mcp = !!(meta.mcp === true || meta.mcp === 1 || String(meta.mcp).toLowerCase() === 'true');
        const x402support = !!(meta.x402support === true || meta.x402support === 1 || String(meta.x402support).toLowerCase() === 'true');
        const active = !!(meta.active === true || meta.active === 1 || String(meta.active).toLowerCase() === 'true');
        const operators = Array.isArray((meta.operators ?? meta.Operators)) ? (meta.operators ?? meta.Operators) : [];
        const a2aSkills = Array.isArray(meta.a2aSkills) ? meta.a2aSkills : [];
        const mcpTools = Array.isArray(meta.mcpTools) ? meta.mcpTools : [];
        const mcpPrompts = Array.isArray(meta.mcpPrompts) ? meta.mcpPrompts : [];
        const mcpResources = Array.isArray(meta.mcpResources) ? meta.mcpResources : [];
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
            did = COALESCE(?, did),
            mcp = COALESCE(?, mcp),
            x402support = COALESCE(?, x402support),
            active = COALESCE(?, active),
            rawJson = COALESCE(?, rawJson),
            updatedAtTime = ?
          WHERE chainId = ? AND agentId = ?
        `, [
          type,
          name, name, name,
          agentAddress, agentAddress, agentAddress,
          desc, desc, desc,
          img, img, img,
          a2aEp, a2aEp, a2aEp,
          ensEndpoint, ensEndpoint, ensEndpoint,
          agentAccountEndpoint,
          JSON.stringify(supportedTrust),
          did,
          mcp ? 1 : 0,
          x402support ? 1 : 0,
          active ? 1 : 0,
          JSON.stringify(meta),
          updateTime,
          chainId,
          agentId,
        ]);

        // Upsert normalized rows
        const insertMany = async (table: string, column: string, values: any[]) => {
          for (const vRaw of values) {
            const v = typeof vRaw === 'string' ? vRaw : JSON.stringify(vRaw);
            await executeUpdate(db, `
              INSERT INTO ${table}(chainId, agentId, ${column}) VALUES(?, ?, ?)
              ON CONFLICT(chainId, agentId, ${column}) DO NOTHING
            `, [chainId, agentId, v]);
          }
        };
        // operators (strings or addresses)
        await insertMany('agent_operators', 'operator', operators.map((o: any) => String(o).toLowerCase()));
        // supported trust (strings)
        await insertMany('agent_supported_trust', 'trust', supportedTrust.map(String));
        // skills/tools/prompts/resources (strings)
        await insertMany('agent_skills', 'skill', a2aSkills.map(String));
        await insertMany('agent_mcp_tools', 'tool', mcpTools.map(String));
        await insertMany('agent_mcp_prompts', 'prompt', mcpPrompts.map(String));
        await insertMany('agent_mcp_resources', 'resource', mcpResources.map(String));
      } catch (error) {
        console.warn('Error updating metadata:', error);
      }
    }
  }
}

