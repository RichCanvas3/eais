import { createPublicClient, http, webSocket, type Address, decodeEventLog } from "viem";
import { db, getCheckpoint, setCheckpoint } from "./db";
import { RPC_WS_URL, CONFIRMATIONS, START_BLOCK, LOGS_CHUNK_SIZE, BACKFILL_MODE, IDENTITY_API_URL, GRAPHQL_URL, GRAPHQL_POLL_MS } from "./env";
import { ethers } from 'ethers';
import { ERC8004Client } from '../../erc8004-src';
import { EthersAdapter } from '../../erc8004-src/adapters/ethers';


import { 
    ETH_SEPOLIA_IDENTITY_REGISTRY, 
    BASE_SEPOLIA_IDENTITY_REGISTRY, 
    ETH_SEPOLIA_RPC_HTTP_URL, 
    BASE_SEPOLIA_RPC_HTTP_URL } from './env';





const ethSepliaEthersProvider = new ethers.JsonRpcProvider(ETH_SEPOLIA_RPC_HTTP_URL);
const ethSepoliathersAdapter = new EthersAdapter(ethSepliaEthersProvider); // No signer needed for reads

console.info("********************* IDENTITY_REGISTRY: ", ETH_SEPOLIA_IDENTITY_REGISTRY);
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
    chainId: 84532, // Base Sepolia
  }
});




// ---- helpers ----
function toDecString(x: bigint | number | string) {
  return typeof x === "bigint" ? x.toString(10) : String(x);
}



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
    console.info("............fetchIpfsJson: tokenURI: ", tokenURI)
    const cid = extractCid(tokenURI);
    if (cid) {
      console.info("............fetchIpfsJson: cid: ", cid)
      console.info("............fetchIpfsJson: IDENTITY_API_URL: ", IDENTITY_API_URL)
      const resp = await fetchFn(`${IDENTITY_API_URL}/api/web3storage/download/${cid}`);
      if (resp?.ok) {
        const json = await resp.json();
        console.info("............fetchIpfsJson: json: ", JSON.stringify(json?.data))
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

async function upsertFromTransfer(to: string, tokenId: bigint, blockNumber: bigint, tokenURI: string | null, chainId: number) {
  console.info("............upsertFromTransfer: tokenURI: ", tokenURI)
  const agentId = toDecString(tokenId);
  const ownerAddress = to;
  const agentAddress = to; // mirror owner for now
  let agentName = ""; // not modeled in ERC-721; leave empty

  console.info(".... ownerAddress", ownerAddress)
  console.info(".... chainId", chainId)

  if (ownerAddress != '0x000000000000000000000000000000000000dEaD') {
    console.info("@@@@@@@@@@@@@@@@@@@@@ upsertFromTransfer: ", agentAddress)
    console.info("............insert into table: agentId: ", agentId)
    console.info("............insert into table: agentAddress: ", agentAddress)
    console.info("............insert into table: agentOwner: ", ownerAddress)
    console.info("............insert into table: agentName: ", agentName)
    console.info("............insert into table: metadataURI: ", tokenURI)
    console.info("............insert into table: chainId: ", chainId)
    console.info("............insert into table: block: ", blockNumber)
    db.prepare(`
      INSERT INTO agents(chainId, agentId, agentAddress, agentOwner, agentName, metadataURI, createdAtBlock, createdAtTime)
      VALUES(@chainId, @agentId, @agentAddress, @agentOwner, @agentName, @metadataURI, @block, strftime('%s','now'))
      ON CONFLICT(chainId, agentId) DO UPDATE SET
        agentAddress=CASE WHEN excluded.agentAddress IS NOT NULL AND excluded.agentAddress != '0x0000000000000000000000000000000000000000' THEN excluded.agentAddress ELSE agentAddress END,
        agentOwner=excluded.agentOwner,
        agentName=COALESCE(NULLIF(TRIM(excluded.agentName), ''), agentName),
        metadataURI=COALESCE(excluded.metadataURI, metadataURI)
    `).run({
      chainId,
      agentId,
      agentAddress,
      agentOwner: ownerAddress,
      agentName,
      metadataURI: tokenURI,
      block: Number(blockNumber),
    });


    const metadata = await fetchIpfsJson(tokenURI);
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
        db.prepare(`
          UPDATE agents SET
            type = COALESCE(type, @type),
            agentName = COALESCE(NULLIF(TRIM(@name), ''), agentName),
            agentAddress = CASE
              WHEN (agentAddress IS NULL OR agentAddress = '0x0000000000000000000000000000000000000000')
                   AND (@agentAddress IS NOT NULL AND @agentAddress != '0x0000000000000000000000000000000000000000')
              THEN @agentAddress
              ELSE agentAddress
            END,
            description = COALESCE(@description, description),
            image = COALESCE(@image, image),
            a2aEndpoint = COALESCE(@a2a, a2aEndpoint),
            ensEndpoint = COALESCE(@ens, ensEndpoint),
            agentAccountEndpoint = COALESCE(@account, agentAccountEndpoint),
            supportedTrust = COALESCE(@trust, supportedTrust),
            rawJson = COALESCE(@raw, rawJson),
            updatedAtTime = strftime('%s','now')
          WHERE chainId = @chainId AND agentId = @agentId
        `).run({
          chainId,
          agentId,
          type,
          name,
          agentAddress,
          description,
          image,
          a2a: a2aEndpoint,
          ens: ensEndpoint,
          account: agentAccountEndpoint,
          trust: JSON.stringify(supportedTrust),
          raw: JSON.stringify(meta),
        });

        recordEvent({ transactionHash: `token:${agentId}`, logIndex: 0, blockNumber }, 'MetadataFetched', { tokenId: agentId });
      } catch (error) {
        console.info("........... error updating a2aEndpoint", error)
      }
    }


  }
  else {
    console.info("remove from list")
    try {
      const agentId = toDecString(tokenId);
      db.prepare("DELETE FROM agents WHERE chainId = ? AND agentId = ?").run(chainId, agentId);
      recordEvent({ transactionHash: `token:${agentId}`, logIndex: 0, blockNumber }, 'Burned', { tokenId: agentId });
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

  console.info("@@@@@@@@@@@@@@@@@@@ upsertFromTokenGraph 1: agentName: ", agentId, agentName)
  db.prepare(`
    INSERT INTO agents(chainId, agentId, agentAddress, agentOwner, agentName, metadataURI, createdAtBlock, createdAtTime)
    VALUES(@chainId, @agentId, @agentAddress, @agentOwner, @agentName, @metadataURI, @block, strftime('%s','now'))
    ON CONFLICT(chainId, agentId) DO UPDATE SET
      agentAddress=CASE WHEN excluded.agentAddress IS NOT NULL AND excluded.agentAddress != '0x0000000000000000000000000000000000000000' THEN excluded.agentAddress ELSE agentAddress END,
      agentOwner=excluded.agentOwner,
      agentName=CASE WHEN excluded.agentName IS NOT NULL AND length(excluded.agentName) > 0 THEN excluded.agentName ELSE agentName END,
      metadataURI=COALESCE(excluded.metadataURI, metadataURI)
  `).run({
    chainId,
    agentId,
    agentAddress,
    agentOwner: ownerAddress,
    agentName,
    metadataURI,
    block: 0,
  });

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
    else raw = JSON.stringify({ agentName: name, description, image, a2aEndpoint, ensEndpoint, agentAccount: agentAccountEndpoint });
  } catch {}

  // Write extended fields into agents
  db.prepare(`
    UPDATE agents SET
      type = COALESCE(type, @type),
      agentName = COALESCE(NULLIF(TRIM(@name), ''), agentName),
      description = COALESCE(@description, description),
      image = COALESCE(@image, image),
      a2aEndpoint = COALESCE(@a2a, a2aEndpoint),
      ensEndpoint = COALESCE(@ens, ensEndpoint),
      agentAccountEndpoint = COALESCE(@account, agentAccountEndpoint),
      supportedTrust = COALESCE(@trust, supportedTrust),
      rawJson = COALESCE(@raw, rawJson),
      updatedAtTime = strftime('%s','now')
    WHERE chainId = @chainId AND agentId = @agentId
  `).run({
    chainId,
    agentId,
    type,
    name,
    description,
    image,
    a2a: a2aEndpoint,
    ens: ensEndpoint,
    account: agentAccountEndpoint,
    trust: JSON.stringify([]),
    raw,
  });
}

function recordEvent(ev: any, type: string, args: any, agentIdForEvent?: string) {
  const id = `${ev.transactionHash}:${ev.logIndex}`;
  const agentId = agentIdForEvent ?? (args?.agentId !== undefined ? toDecString(args.agentId) : (args?.tokenId !== undefined ? toDecString(args.tokenId) : "0"));
  db.prepare(`INSERT OR IGNORE INTO events(id, agentId, type, blockNumber, logIndex, txHash, data)
              VALUES(@id, @agentId, @type, @block, @idx, @tx, @data)`).run({
    id,
    agentId,
    type,
    block: Number(ev.blockNumber),
    idx: Number(ev.logIndex),
    tx: ev.transactionHash,
    data: JSON.stringify({ ...args, agentId })
  });
}

async function backfill(client: ERC8004Client) {

  const chainId = await client.getChainId();

  // GraphQL-driven indexing: fetch latest transfers and upsert
  if (!GRAPHQL_URL) {
    console.warn('GRAPHQL_URL not configured; skipping GraphQL backfill');
    return;
  }
  const last = getCheckpoint();
  const query = `query TokensAndTransfers($first: Int!) {
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
    }
    transfers(first: $first, orderBy: timestamp, orderDirection: desc) {
      id
      token { id }
      from { id }
      to { id }
      blockNumber
      timestamp
    }
  }`;

  console.info("............backfill: query: ", GRAPHQL_URL)

  const fetchJson = async (body: any) => {
    // Normalize URL: some gateways expect <key>/<subgraph> without trailing /graphql
    const endpoint = (GRAPHQL_URL || '').replace(/\/graphql\/?$/i, '');
    const res = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'accept': 'application/json' }, body: JSON.stringify(body) } as any);
    if (!res.ok) {
      let text = '';
      try { text = await res.text(); } catch {}
      throw new Error(`GraphQL ${res.status}: ${text || res.statusText}`);
    }
    return await res.json();
  };

  console.info("............backfill: GRAPHQL_URL: ", fetchJson)

  const pageSize = 100;
  const resp = await fetchJson({ query, variables: { first: pageSize } });
  // Handle tokens (metadata) and transfers (ownership)
  
  const transferItems = (resp?.data?.transfers as any[]) || [];

  // Upsert latest tokens metadata first (oldest-first by mintedAt)



  // Apply transfers newer than checkpoint
  const transfersOrdered = transferItems
    .filter((t) => Number(t?.blockNumber || 0) > Number(last))
    .slice()
    .sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber));
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
    await upsertFromTransfer(toAddr, tokenId, blockNum, uri, chainId); // ETH Sepolia chainId
    setCheckpoint(blockNum);
  }


  const tokenItems = (resp?.data?.tokens as any[]) || [];
  const tokensOrdered = tokenItems
  .slice()
  .sort((a, b) => Number((a.mintedAt || 0)) - Number((b.mintedAt || 0)));
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
      await upsertFromTransfer(owner, id, 0n, uri, chainId); // Base Sepolia chainId
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

(async () => {
  // Initial run (don’t crash on failure)
  try {
    await backfill(erc8004EthSepoliaClient);
    //await backfillByIds(erc8004EthSepoliaClient)
    await backfillByIds(erc8004BaseSepoliaClient)
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
