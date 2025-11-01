import { createPublicClient, http, webSocket, type Address, decodeEventLog } from "viem";
import { db, getCheckpoint, setCheckpoint } from "./db";
import { RPC_WS_URL, CONFIRMATIONS, START_BLOCK, LOGS_CHUNK_SIZE, BACKFILL_MODE, ETH_SEPOLIA_GRAPHQL_URL, BASE_SEPOLIA_GRAPHQL_URL, OP_SEPOLIA_GRAPHQL_URL, GRAPHQL_API_KEY, GRAPHQL_POLL_MS } from "./env";
import { ethers } from 'ethers';
import { ERC8004Client, EthersAdapter } from '@erc8004/sdk';


import { 
    ETH_SEPOLIA_IDENTITY_REGISTRY, 
    BASE_SEPOLIA_IDENTITY_REGISTRY, 
    OP_SEPOLIA_IDENTITY_REGISTRY,
    ETH_SEPOLIA_RPC_HTTP_URL, 
    BASE_SEPOLIA_RPC_HTTP_URL,
    OP_SEPOLIA_RPC_HTTP_URL } from './env';





const ethSepliaEthersProvider = new ethers.JsonRpcProvider(ETH_SEPOLIA_RPC_HTTP_URL);
const ethSepoliathersAdapter = new EthersAdapter(ethSepliaEthersProvider); // No signer needed for reads


const erc8004EthSepoliaClient = new ERC8004Client({
  adapter: ethSepoliathersAdapter,
  addresses: {
    identityRegistry: ETH_SEPOLIA_IDENTITY_REGISTRY,
    reputationRegistry: '0x0000000000000000000000000000000000000000', // Not used by indexer
    validationRegistry: '0x0000000000000000000000000000000000000000', // Not used by indexer
    chainId: 11155111, // Eth Sepolia
  }
});


const baseSepliaEthersProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC_HTTP_URL);
const baseSepoliathersAdapter = new EthersAdapter(baseSepliaEthersProvider); // No signer needed for reads

const erc8004BaseSepoliaClient = new ERC8004Client({
  adapter: baseSepoliathersAdapter,
  addresses: {
    identityRegistry: BASE_SEPOLIA_IDENTITY_REGISTRY,
    reputationRegistry: '0x0000000000000000000000000000000000000000', // Not used by indexer
    validationRegistry: '0x0000000000000000000000000000000000000000', // Not used by indexer
    chainId: 84532, // Base Sepolia (L2)
  }
});

const opSepliaEthersProvider = OP_SEPOLIA_RPC_HTTP_URL ? new ethers.JsonRpcProvider(OP_SEPOLIA_RPC_HTTP_URL) : null;
const opSepoliathersAdapter = opSepliaEthersProvider ? new EthersAdapter(opSepliaEthersProvider) : null;

const erc8004OpSepoliaClient = opSepoliathersAdapter && OP_SEPOLIA_IDENTITY_REGISTRY ? new ERC8004Client({
  adapter: opSepoliathersAdapter,
  addresses: {
    identityRegistry: OP_SEPOLIA_IDENTITY_REGISTRY,
    reputationRegistry: '0x0000000000000000000000000000000000000000', // Not used by indexer
    validationRegistry: '0x0000000000000000000000000000000000000000', // Not used by indexer
    chainId: 11155420, // Optimism Sepolia (L2)
  }
}) : null;


// ---- helpers ----
function toDecString(x: bigint | number | string) {
  return typeof x === "bigint" ? x.toString(10) : String(x);
}



async function tryReadTokenURI(client: ERC8004Client, tokenId: bigint): Promise<string | null> {
  try {
    console.info("............tryReadTokenURI: tokenId: ", tokenId)
    const uri = await client.identity.getTokenURI(tokenId);
    console.info("............tryReadTokenURI: uri: ", uri)
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
            // Try base64 decode first
            const jsonString = Buffer.from(jsonData, 'base64').toString('utf-8');
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
      // Fetch directly from IPFS gateway (Web3.Storage)
      const ipfsUrl = `https://${cid}.ipfs.w3s.link`;
      console.info("............fetchIpfsJson: fetching from IPFS gateway: ", ipfsUrl)
      const resp = await fetchFn(ipfsUrl);
      if (resp?.ok) {
        const json = await resp.json();
        console.info("............fetchIpfsJson: json: ", JSON.stringify(json))
        return json ?? null;
      }
    }
    if (/^https?:\/\//i.test(tokenURI)) {
      const resp = await fetchFn(tokenURI);
      if (resp?.ok) return await resp.json();
    }
  } catch {}
  return null;
}

async function upsertFromTransfer(to: string, tokenId: bigint, blockNumber: bigint, tokenURI: string | null, chainId: number) {
  console.info("............upsertFromTransfer: tokenURI: ", tokenURI)
  const agentId = toDecString(tokenId);
  const ownerAddress = to;
  const agentAddress = to; // mirror owner for now
  let agentName = ""; // not modeled in ERC-721; leave empty

  console.info(".... ownerAddress", ownerAddress)
  console.info(".... chainId", chainId)

  // Fetch metadata from tokenURI BEFORE database insert to populate all fields
  let preFetchedMetadata: any = null;
  let a2aEndpoint: string | null = null;
  if (tokenURI) {
    try {
      console.info("............upsertFromTransfer: fetching metadata from tokenURI before insert");
      const metadata = await fetchIpfsJson(tokenURI);
      if (metadata && typeof metadata === 'object') {
        console.info("............upsertFromTransfer: metadata fetched:", metadata);
        preFetchedMetadata = metadata;
        
        // Extract agent name
        if (typeof metadata.name === 'string' && metadata.name.trim()) {
          agentName = metadata.name.trim();
          console.info("............upsertFromTransfer: found agentName:", agentName);
        }
        
        // Extract a2a endpoint from endpoints array
        const endpoints = Array.isArray(metadata.endpoints) ? metadata.endpoints : [];
        const findEndpoint = (n: string) => {
          const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
          return e && typeof e.endpoint === 'string' ? e.endpoint : null;
        };
        a2aEndpoint = findEndpoint('A2A') || findEndpoint('a2a');
        if (a2aEndpoint) {
          console.info("............upsertFromTransfer: found a2aEndpoint:", a2aEndpoint);
        }
      }
    } catch (e) {
      console.warn("............upsertFromTransfer: Failed to fetch metadata before insert:", e);
    }
  }

  if (ownerAddress != '0x000000000000000000000000000000000000dEaD') {
    console.info("@@@@@@@@@@@@@@@@@@@@@ upsertFromTransfer: ", agentAddress)
    console.info("............insert into table: agentId: ", agentId)
    console.info("............insert into table: agentAddress: ", agentAddress)
    console.info("............insert into table: agentOwner: ", ownerAddress)
    console.info("............insert into table: agentName: ", agentName)
    console.info("............insert into table: a2aEndpoint: ", a2aEndpoint)
    console.info("............insert into table: metadataURI: ", tokenURI)
    console.info("............insert into table: chainId: ", chainId)
    console.info("............insert into table: block: ", blockNumber)
    const currentTime = Math.floor(Date.now() / 1000);
    await db.prepare(`
      INSERT INTO agents(chainId, agentId, agentAddress, agentOwner, agentName, metadataURI, a2aEndpoint, createdAtBlock, createdAtTime)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(chainId, agentId) DO UPDATE SET
        agentAddress=CASE WHEN excluded.agentAddress IS NOT NULL AND excluded.agentAddress != '0x0000000000000000000000000000000000000000' THEN excluded.agentAddress ELSE agentAddress END,
        agentOwner=excluded.agentOwner,
        agentName=COALESCE(NULLIF(TRIM(excluded.agentName), ''), agentName),
        a2aEndpoint=COALESCE(excluded.a2aEndpoint, a2aEndpoint),
        metadataURI=COALESCE(excluded.metadataURI, metadataURI)
    `).run(
      chainId,
      agentId,
      agentAddress,
      ownerAddress,
      agentName,
      tokenURI,
      a2aEndpoint,
      Number(blockNumber),
      currentTime
    );


    // Use pre-fetched metadata if available, otherwise fetch now
    const metadata = preFetchedMetadata || await fetchIpfsJson(tokenURI);
    if (metadata) {
      try {
        const meta = metadata as any;
        const type = typeof meta.type === 'string' ? meta.type : null;
        const name = typeof meta.name === 'string' ? meta.name : null;

        const description = typeof meta.description === 'string' ? meta.description : null;
        const image = meta.image == null ? null : String(meta.image);
        const endpoints = Array.isArray(meta.endpoints) ? meta.endpoints : [];
        const findEndpoint = (n: string) => {
          const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
          return e && typeof e.endpoint === 'string' ? e.endpoint : null;
        };
        const a2aEndpoint = findEndpoint('A2A');
        const ensEndpoint = findEndpoint('ENS');
        let agentAccountEndpoint = findEndpoint('agentAccount');
        // Always ensure agentAccountEndpoint reflects current owner `to`
        console.info("............agentAccountEndpoint: ", agentAccountEndpoint)
        if (!agentAccountEndpoint || !/^eip155:/i.test(agentAccountEndpoint)) {
          console.info("............agentAccountEndpoint: no endpoint found, setting to: ", `eip155:${chainId}:${to}`)
          agentAccountEndpoint = `eip155:${chainId}:${to}`;
        }
        const supportedTrust = Array.isArray(meta.supportedTrust) ? meta.supportedTrust.map(String) : [];
        console.info("............update into table: agentId: ", agentId)
        console.info("............update into table: agentAddress: ", agentAddress)
        console.info("............update into table: type: ", type)
        console.info("............update into table: name: ", name)
        console.info("............update into table: description: ", description)
        console.info("............update into table: image: ", image)
        console.info("............update into table: a2aEndpoint: ", a2aEndpoint)
        console.info("............update into table: ensEndpoint: ", ensEndpoint)
        const updateTime = Math.floor(Date.now() / 1000);
        await db.prepare(`
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
        `).run(
          type,
          name, name, name,
          agentAddress, agentAddress, agentAddress,
          description, description, description,
          image, image, image,
          a2aEndpoint, a2aEndpoint, a2aEndpoint,
          ensEndpoint, ensEndpoint, ensEndpoint,
          agentAccountEndpoint,
          JSON.stringify(supportedTrust),
          JSON.stringify(meta),
          updateTime,
          chainId,
          agentId,
        );

        await recordEvent({ transactionHash: `token:${agentId}`, logIndex: 0, blockNumber }, 'MetadataFetched', { tokenId: agentId });
      } catch (error) {
        console.info("........... error updating a2aEndpoint", error)
      }
    }


  }
  else {
    console.info("remove from list")
    try {
      const agentId = toDecString(tokenId);
      await db.prepare("DELETE FROM agents WHERE chainId = ? AND agentId = ?").run(chainId, agentId);
      await recordEvent({ transactionHash: `token:${agentId}`, logIndex: 0, blockNumber }, 'Burned', { tokenId: agentId });
    } catch {}
  }
}

// Parse CAIP-10 like eip155:chainId:0x... to 0x address
function parseCaip10Address(value: string | null | undefined): string | null {
  try {
    if (!value) return null;
    const v = String(value).trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(v)) return v;
    if (v.startsWith('eip155:')) {
      const parts = v.split(':');
      const addr = parts[2];
      if (addr && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
    }
  } catch {}
  return null;
}

async function upsertFromTokenGraph(item: any, chainId: number) {
  const tokenId = BigInt(item?.id || 0);
  if (tokenId <= 0n) return;
  const agentId = toDecString(tokenId);
  const ownerAddress = parseCaip10Address(item?.agentAccount) || '0x0000000000000000000000000000000000000000';
  const agentAddress = ownerAddress;
  let agentName = typeof item?.agentName === 'string' ? item.agentName : '';
  const metadataURI = typeof item?.uri === 'string' ? item.uri : null;

  // If name is missing but we have a tokenURI, try to fetch and infer fields
  let inferred: any | null = null;
  if ((!agentName || agentName.trim() === '') && metadataURI) {
    try {
      console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: metadataURI: ", metadataURI)
      inferred = await fetchIpfsJson(metadataURI);
      if (inferred && typeof inferred === 'object') {
        console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: inferred: ", inferred)
        if (typeof inferred.name === 'string' && inferred.name.trim() !== '') {
          agentName = inferred.name.trim();
          console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: agentName: ", agentName)
        }
      }
    } catch {}
  }
  
  // Also fetch URI metadata if metadataJson is empty to get complete data
  let uriMetadata: any | null = null;
  if (metadataURI && (!item?.metadataJson || (typeof item.metadataJson === 'string' && item.metadataJson.trim() === ''))) {
    try {
      console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: metadataJson is empty, fetching from metadataURI:", metadataURI);
      uriMetadata = await fetchIpfsJson(metadataURI);
      if (uriMetadata && typeof uriMetadata === 'object') {
        console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: fetched URI metadata:", uriMetadata);
        
        // Update agentName from URI metadata if it's missing
        if ((!agentName || agentName.trim() === '') && typeof uriMetadata.name === 'string' && uriMetadata.name.trim()) {
          agentName = uriMetadata.name.trim();
          console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: updated agentName from URI:", agentName);
        }
      }
    } catch (uriError) {
      console.warn("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: Failed to fetch URI metadata:", uriError);
    }
  }

  console.info("@@@@@@@@@@@@@@@@@@@ upsertFromTokenGraph 1: agentName: ", agentId, agentName)
  const currentTime = Math.floor(Date.now() / 1000);
  await db.prepare(`
    INSERT INTO agents(chainId, agentId, agentAddress, agentOwner, agentName, metadataURI, createdAtBlock, createdAtTime)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(chainId, agentId) DO UPDATE SET
      agentAddress=CASE WHEN excluded.agentAddress IS NOT NULL AND excluded.agentAddress != '0x0000000000000000000000000000000000000000' THEN excluded.agentAddress ELSE agentAddress END,
      agentOwner=excluded.agentOwner,
      agentName=CASE WHEN excluded.agentName IS NOT NULL AND length(excluded.agentName) > 0 THEN excluded.agentName ELSE agentName END,
      metadataURI=COALESCE(excluded.metadataURI, metadataURI)
  `).run(
    chainId,
    agentId,
    agentAddress,
    ownerAddress,
    agentName,
    metadataURI,
    0,
    currentTime
  );

  const type = null;
  let name: string | null = typeof item?.agentName === 'string' ? item.agentName : null;
  let description: string | null = typeof item?.description === 'string' ? item.description : null;
  let image: string | null = item?.image == null ? null : String(item.image);
  let a2aEndpoint: string | null = typeof item?.a2aEndpoint === 'string' ? item.a2aEndpoint : null;
  let ensEndpoint: string | null = typeof item?.ensName === 'string' ? item.ensName : null;

  // Fill from inferred registration JSON when missing
  if (inferred && typeof inferred === 'object') {
    try {
      if ((!name || !name.trim()) && typeof inferred.name === 'string') name = inferred.name.trim();
      if ((!description || !description.trim()) && typeof inferred.description === 'string') description = inferred.description;
      if (!image && inferred.image != null) image = String(inferred.image);
      if (!a2aEndpoint) {
        const eps = Array.isArray(inferred.endpoints) ? inferred.endpoints : [];
        const a2a = eps.find((e: any) => String(e?.name || '').toUpperCase() === 'A2A');
        const a2aUrl = (a2a?.endpoint || a2a?.url) as string | undefined;
        if (a2aUrl) a2aEndpoint = a2aUrl;
      }
      if (!ensEndpoint) {
        const eps = Array.isArray(inferred.endpoints) ? inferred.endpoints : [];
        const ens = eps.find((e: any) => String(e?.name || '').toUpperCase() === 'ENS');
        const ensName = (ens?.endpoint || ens?.url) as string | undefined;
        if (ensName) ensEndpoint = ensName;
      }
    } catch {}
  }

  const agentAccountEndpoint = (() => {
    const parsedAccount = parseCaip10Address(item?.agentAccount);
    if (parsedAccount) return `eip155:${chainId}:${parsedAccount}`;
    if (ownerAddress && ownerAddress !== '0x0000000000000000000000000000000000000000') return `eip155:${chainId}:${ownerAddress}`;
    return null;
  })();

  let raw: string = '{}';
  try {
    if (item?.metadataJson && typeof item.metadataJson === 'string') raw = item.metadataJson;
    else if (item?.metadataJson && typeof item.metadataJson === 'object') raw = JSON.stringify(item.metadataJson);
    else if (inferred) raw = JSON.stringify(inferred);
    else {
      // Use uriMetadata if we fetched it earlier
      if (uriMetadata && typeof uriMetadata === 'object') {
        console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: using previously fetched URI metadata");
        raw = JSON.stringify(uriMetadata);
        
        // Update fields from URI metadata (override empty values from GraphQL)
        if (typeof uriMetadata.name === 'string' && uriMetadata.name.trim()) {
          name = uriMetadata.name.trim();
          console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: updated name from URI:", name);
        }
        if (typeof uriMetadata.description === 'string' && uriMetadata.description.trim()) {
          description = uriMetadata.description;
          console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: updated description from URI:", description);
        }
        if (uriMetadata.image != null) {
          image = String(uriMetadata.image);
          console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: updated image from URI:", image);
        }
        
        // Extract endpoints using the same logic as upsertFromTransfer
        const endpoints = Array.isArray(uriMetadata.endpoints) ? uriMetadata.endpoints : [];
        const findEndpoint = (n: string) => {
          const e = endpoints.find((x: any) => (x?.name ?? '').toLowerCase() === n.toLowerCase());
          return e && typeof e.endpoint === 'string' ? e.endpoint : null;
        };
        
        const uriA2aEndpoint = findEndpoint('A2A');
        if (uriA2aEndpoint) {
          a2aEndpoint = uriA2aEndpoint;
          console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: updated a2aEndpoint from URI:", a2aEndpoint);
        }
        
        const uriEnsEndpoint = findEndpoint('ENS');
        if (uriEnsEndpoint) {
          ensEndpoint = uriEnsEndpoint;
          console.info("^^^^^^^^^^^^^^^^^^^^^ upsertFromTokenGraph: updated ensEndpoint from URI:", ensEndpoint);
        }
      } else {
        raw = JSON.stringify({ agentName: name, description, image, a2aEndpoint, ensEndpoint, agentAccount: agentAccountEndpoint });
      }
    }
  } catch {}

  // Write extended fields into agents
  const updateTime = Math.floor(Date.now() / 1000);
  await db.prepare(`
    UPDATE agents SET
      type = COALESCE(type, ?),
      agentName = COALESCE(NULLIF(TRIM(?), ''), agentName),
      description = COALESCE(?, description),
      image = COALESCE(?, image),
      a2aEndpoint = COALESCE(?, a2aEndpoint),
      ensEndpoint = COALESCE(?, ensEndpoint),
      agentAccountEndpoint = COALESCE(?, agentAccountEndpoint),
      supportedTrust = COALESCE(?, supportedTrust),
      rawJson = COALESCE(?, rawJson),
      updatedAtTime = ?
    WHERE chainId = ? AND agentId = ?
  `).run(
    type,
    name,
    description,
    image,
    a2aEndpoint,
    ensEndpoint,
    agentAccountEndpoint,
    JSON.stringify([]),
    raw,
    updateTime,
    chainId,
    agentId,
  );
}

async function recordEvent(ev: any, type: string, args: any, agentIdForEvent?: string) {
  const id = `${ev.transactionHash}:${ev.logIndex}`;
  const agentId = agentIdForEvent ?? (args?.agentId !== undefined ? toDecString(args.agentId) : (args?.tokenId !== undefined ? toDecString(args.tokenId) : "0"));
  await db.prepare(`INSERT OR IGNORE INTO events(id, agentId, type, blockNumber, logIndex, txHash, data)
              VALUES(?, ?, ?, ?, ?, ?, ?)`).run(
    id,
    agentId,
    type,
    Number(ev.blockNumber),
    Number(ev.logIndex),
    ev.transactionHash,
    JSON.stringify({ ...args, agentId })
  );
}

async function backfill(client: ERC8004Client) {

  const chainId = await client.getChainId();

  // Get chain-specific GraphQL URL
  let graphqlUrl = '';
  if (chainId === 11155111) {
    // ETH Sepolia
    graphqlUrl = ETH_SEPOLIA_GRAPHQL_URL;
  } else if (chainId === 84532) {
    // Base Sepolia (L2)
    graphqlUrl = BASE_SEPOLIA_GRAPHQL_URL;
  } else if (chainId === 11155420) {
    // Optimism Sepolia (L2)
    graphqlUrl = OP_SEPOLIA_GRAPHQL_URL;
  } 


  console.info("............backfill: chainId: ", chainId)
  console.info("............backfill: graphqlUrl: ", graphqlUrl)


  // GraphQL-driven indexing: fetch latest transfers and upsert
  if (!graphqlUrl) {
    console.warn(`GRAPHQL_URL not configured for chain ${chainId}; skipping GraphQL backfill`);
    return;
  }

  const last = await getCheckpoint(chainId);


  console.info("............backfill: query: ", graphqlUrl, "for chain:", chainId)

  const fetchJson = async (body: any) => {
    // Normalize URL: some gateways expect <key>/<subgraph> without trailing /graphql
    const endpoint = (graphqlUrl || '').replace(/\/graphql\/?$/i, '');
    
    // Prepare headers
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'accept': 'application/json'
    };
    
    // Add authorization header if API key is provided
    if (GRAPHQL_API_KEY) {
      headers['Authorization'] = `Bearer ${GRAPHQL_API_KEY}`;
    }
    
    const res = await fetch(endpoint, { 
      method: 'POST', 
      headers, 
      body: JSON.stringify(body) 
    } as any);
    
    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch {}
      throw new Error(`GraphQL ${res.status}: ${text || res.statusText}`);
    }
    return await res.json();
  };




  const pageSize = 1000; // Increased page size to fetch more historical data
  console.info("............backfill: Fetching transfers with pageSize:", pageSize, "last checkpoint:", last.toString());
  

  const historicalQuery = `query TokensAndTransfers($first: Int!) {
    transfers(first: $first, orderBy: timestamp, orderDirection: asc) {
      id
      token { id }
      from { id }
      to { id }
      blockNumber
      timestamp
    }
  }`;
  
  const resp = await fetchJson({ query: historicalQuery, variables: { first: pageSize } }) as any;
  
  // Handle tokens (metadata) and transfers (ownership)
  const transferItems = (resp?.data?.transfers as any[]) || [];

  // Upsert latest tokens metadata first (oldest-first by mintedAt)

  // Apply transfers newer than checkpoint
  const transfersOrdered = transferItems
    .filter((t) => Number(t?.blockNumber || 0) > Number(last))
    .slice()
    .sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber));

  console.info("............  process transfers: ")
  for (const tr of transfersOrdered) {
    
    const tokenId = BigInt(tr?.token?.id || '0');
    const toAddr = String(tr?.to?.id || '').toLowerCase();
    const blockNum = BigInt(tr?.blockNumber || 0);
    if (tokenId <= 0n || !toAddr) continue;
    const uri = await tryReadTokenURI(client, tokenId);
    
    console.info("&&&&&&&&&&&& upsertFromTransfer: toAddr: ", toAddr)
    console.info("&&&&&&&&&&&& upsertFromTransfer: tokenId: ", tokenId)
    console.info("&&&&&&&&&&&& upsertFromTransfer: blockNum: ", blockNum)
    console.info("&&&&&&&&&&&& upsertFromTransfer: uri: ", uri)
    await upsertFromTransfer(toAddr, tokenId, blockNum, uri, chainId); 
    await setCheckpoint(blockNum, chainId);
  }



  const tokenItems = ((resp as any)?.data?.tokens as any[]) || [];
  const tokensOrdered = tokenItems
  .slice()
  .sort((a, b) => Number((a.mintedAt || 0)) - Number((b.mintedAt || 0)));

  console.info("............  process tokens: ", tokensOrdered)
  for (const t of tokensOrdered) {
    console.info(">>>>>>>>>>>>>>> upsertFromTokenGraph: t: ", t)
    await upsertFromTokenGraph(t, chainId); // ETH Sepolia chainId
  }

 

}

async function backfillByIds(client: ERC8004Client) {

  const chainId = await client.getChainId();
  
  // Optional ID-based backfill for sequential tokenIds starting at 1
  async function idExists(client: ERC8004Client, id: bigint): Promise<boolean> {
    try {
      // Use ownerOf - if it doesn't throw, the token exists
      await client.identity.getOwner(id);
      return true;
    } catch {
      return false;
    }
  }

  // Exponential + binary search to find max existing tokenId
  let lo = 0n;
  let hi = 1n;
  while (await idExists(client, hi)) { lo = hi; hi <<= 1n; }
  let left = lo + 1n;
  let right = hi;
  let max = lo;
  while (left <= right) {
    const mid = (left + right) >> 1n;
    if (await idExists(client, mid)) { max = mid; left = mid + 1n; } else { right = mid - 1n; }
  }

  if (max === 0n) {
    console.log('No tokens found via ID scan.');
    try {
      console.info('Clearing database rows: agents, agent_metadata, events');
      try { db.prepare('DELETE FROM agent_metadata').run(); } catch {}
      try { db.prepare('DELETE FROM agents').run(); } catch {}
      try { db.prepare('DELETE FROM events').run(); } catch {}
    } catch {}
    return;
  }

  console.log(`ID backfill: scanning 1 → ${max}`);
  for (let id = 1n; id <= max; id++) {
    try {

      const owner = await client.identity.getOwner(id);
      const uri = await tryReadTokenURI(client, id);
      console.info("............uri: ", uri)
      await upsertFromTransfer(owner, id, 0n, uri, chainId); // L2 chainId (Base Sepolia or Optimism Sepolia)
    } catch {
      // skip gaps or read errors
    }
  }
}
/*
function watch() {
  const unsubs = [
    client.watchContractEvent({ address: IDENTITY_REGISTRY as `0x${string}`, abi: identityRegistryAbi, eventName: 'Transfer', onLogs: async (logs) => {
      for (const log of logs) {
        const { from, to, tokenId } = (log as any).args;
        const uri = await tryReadTokenURI(tokenId as bigint);
        await upsertFromTransfer(to as string, tokenId as bigint, log.blockNumber!, uri);
        recordEvent(log, 'Transfer', { from, to, tokenId: toDecString(tokenId) });
        setCheckpoint(log.blockNumber!);
      }
    }}),
    client.watchContractEvent({ address: IDENTITY_REGISTRY as `0x${string}`, abi: identityRegistryAbi, eventName: 'Approval', onLogs: (logs) => {
      for (const log of logs) {
        recordEvent(log, 'Approval', { ...((log as any).args), tokenId: toDecString(((log as any).args).tokenId) });
        setCheckpoint(log.blockNumber!);
      }
    }}),
    client.watchContractEvent({ address: IDENTITY_REGISTRY as `0x${string}`, abi: identityRegistryAbi, eventName: 'ApprovalForAll', onLogs: (logs) => {
      for (const log of logs) {
        recordEvent(log, 'ApprovalForAll', (log as any).args);
        setCheckpoint(log.blockNumber!);
      }
    }}),
    client.watchContractEvent({ address: IDENTITY_REGISTRY as `0x${string}`, abi: identityRegistryAbi, eventName: 'MetadataSet', onLogs: (logs) => {
      for (const log of logs) {
        recordEvent(log, 'MetadataSet', { ...((log as any).args), agentId: toDecString(((log as any).args).agentId) });
        setCheckpoint(log.blockNumber!);
      }
    }}),
    // Removed MetadataDeleted watcher (no longer in ABI)
  ];
  return () => unsubs.forEach((u) => u?.());
}
  */

// Parse command-line arguments
function parseArgs() {
  const args: { agentId?: string } = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--agentId' || arg === '--agent-id') {
      args.agentId = argv[i + 1];
      i++;
    }
  }
  
  return args;
}

// Process a specific agentId across all chains, ignoring checkpoints
async function processSingleAgentId(agentId: string) {
  const agentIdBigInt = BigInt(agentId);
  console.log(`🔄 Processing agentId ${agentId} across all chains (ignoring checkpoints)...`);
  
  const clients = [
    { name: 'ETH Sepolia', client: erc8004EthSepoliaClient, chainId: 11155111 },
    { name: 'Base Sepolia', client: erc8004BaseSepoliaClient, chainId: 84532 },
  ];
  
  if (erc8004OpSepoliaClient) {
    clients.push({ name: 'Optimism Sepolia', client: erc8004OpSepoliaClient, chainId: 11155420 });
  }
  
  for (const { name, client, chainId } of clients) {
    try {
      console.log(`\n📋 Processing ${name} (chainId: ${chainId})...`);
      
      // Check if agent exists by trying to get owner
      try {
        const owner = await client.identity.getOwner(agentIdBigInt);
        const tokenURI = await tryReadTokenURI(client, agentIdBigInt);
        
        // Get current block number for timestamp (use a recent block or current)
        const publicClient = (client as any).adapter?.provider;
        let blockNumber = 0n;
        try {
          const block = await publicClient?.getBlockNumber?.() || await publicClient?.getBlock?.('latest');
          blockNumber = block?.number ? BigInt(block.number) : 0n;
        } catch {
          // If we can't get block number, use 0
          blockNumber = 0n;
        }
        
        if (owner && owner !== '0x0000000000000000000000000000000000000000') {
          console.log(`  ✅ Agent ${agentId} exists on ${name}, owner: ${owner}`);
          await upsertFromTransfer(owner.toLowerCase(), agentIdBigInt, blockNumber || 0n, tokenURI, chainId);
          console.log(`  ✅ Successfully processed agentId ${agentId} on ${name}`);
        } else {
          console.log(`  ⚠️  Agent ${agentId} does not exist or is burned on ${name}`);
        }
      } catch (error: any) {
        console.log(`  ⚠️  Agent ${agentId} not found on ${name}: ${error?.message || error}`);
      }
    } catch (error: any) {
      console.error(`  ❌ Error processing ${name}:`, error?.message || error);
    }
  }
  
  console.log(`\n✅ Finished processing agentId ${agentId}`);
}

(async () => {
  const args = parseArgs();
  
  // If agentId is specified, process only that agent
  if (args.agentId) {
    console.log(`🎯 Single agent mode: processing agentId ${args.agentId}`);
    await processSingleAgentId(args.agentId);
    process.exit(0);
  }
  
  // Normal indexing mode
  // Check if database has any data - if not, reset checkpoint to 0
  try {
    const agentCount = await db.prepare('SELECT COUNT(*) as count FROM agents').get() as { count: number };
    const eventCount = await db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
    
    if (agentCount.count === 0 && eventCount.count === 0) {
      console.log('Database is empty - resetting checkpoints to 0 for all chains');
      await setCheckpoint(0n, 11155111); // ETH Sepolia
      await setCheckpoint(0n, 84532); // Base Sepolia (L2)
      await setCheckpoint(0n, 11155420); // Optimism Sepolia (L2)
      // Clear any stale checkpoint data
      await db.prepare("DELETE FROM checkpoints WHERE key LIKE 'lastProcessed%'").run();
    }
  } catch (error) {
    console.warn('Error checking database state:', error);
  }

  // Initial run (don't crash on failure)
  try {
    await backfill(erc8004EthSepoliaClient);
    await backfill(erc8004BaseSepoliaClient);
    
    /*
    //await backfillByIds(erc8004EthSepoliaClient)
    await backfill(erc8004BaseSepoliaClient);
    //await backfillByIds(erc8004BaseSepoliaClient)
    if (erc8004OpSepoliaClient) {
      await backfill(erc8004OpSepoliaClient);
      //await backfillByIds(erc8004OpSepoliaClient)
    }
      */
  } catch (e) {
    console.error('Initial GraphQL backfill failed:', e);
  }
  // Subscribe to on-chain events as a safety net (optional)
  //const unwatch = watch();

  // Poll GraphQL for new transfers beyond checkpoint
  //const interval = setInterval(() => { backfill().catch((e) => console.error('GraphQL backfill error', e)); }, Math.max(5000, GRAPHQL_POLL_MS));
  //console.log("Indexer running (GraphQL + watch). Press Ctrl+C to exit.");
  //process.on('SIGINT', () => { clearInterval(interval); unwatch(); process.exit(0); });
})();
