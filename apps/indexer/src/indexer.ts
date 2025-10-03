import { createPublicClient, http, webSocket, type Address, decodeEventLog } from "viem";
import { identityRegistryAbi } from "./abi/identityRegistry";
import { db, getCheckpoint, setCheckpoint } from "./db";
import { REGISTRY_ADDRESS, RPC_HTTP_URL, RPC_WS_URL, CONFIRMATIONS, START_BLOCK, LOGS_CHUNK_SIZE, BACKFILL_MODE, IPFS_API_URL } from "./env";

// ---- client ----
const transport = RPC_WS_URL ? webSocket(RPC_WS_URL) : http(RPC_HTTP_URL);
const client = createPublicClient({ transport });
const address = REGISTRY_ADDRESS as Address;

// ---- helpers ----
function toDecString(x: bigint | number | string) {
  return typeof x === "bigint" ? x.toString(10) : String(x);
}

async function tryReadTokenURI(tokenId: bigint): Promise<string | null> {
  try {
    const uri = await client.readContract({ address, abi: identityRegistryAbi, functionName: "tokenURI", args: [tokenId] }) as string;
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
      console.info("............fetchIpfsJson: IPFS_API_URL: ", IPFS_API_URL)
      const resp = await fetchFn(`${IPFS_API_URL}/api/web3storage/download/${cid}`);
      if (resp?.ok) {
        const json = await resp.json();
        console.info("............fetchIpfsJson: json: ", json)
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

async function upsertFromTransfer(to: string, tokenId: bigint, blockNumber: bigint, tokenURI: string | null) {
  console.info("............upsertFromTransfer: tokenURI: ", tokenURI)
  const agentId = toDecString(tokenId);
  const ownerAddress = to;
  const agentAddress = to; // mirror owner for now
  const domain = ""; // not modeled in ERC-721; leave empty

  db.prepare(`
    INSERT INTO agents(agentId, agent, owner, domain, metadataURI, createdAtBlock, createdAtTime)
    VALUES(@agentId, @agent, @owner, @domain, @metadataURI, @block, strftime('%s','now'))
    ON CONFLICT(agentId) DO UPDATE SET
      agent=excluded.agent,
      owner=excluded.owner,
      domain=excluded.domain,
      metadataURI=COALESCE(excluded.metadataURI, metadataURI)
  `).run({
    agentId,
    agent: agentAddress,
    owner: ownerAddress,
    domain,
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
      const agentWalletEndpoint = findEndpoint('agentWallet');
      const supportedTrust = Array.isArray(meta.supportedTrust) ? meta.supportedTrust.map(String) : [];
      db.prepare(`
        INSERT INTO agent_metadata(agentId, type, name, description, image, a2aEndpoint, ensEndpoint, agentWalletEndpoint, supportedTrust, rawJson, updatedAtTime)
        VALUES(@agentId, @type, @name, @description, @image, @a2a, @ens, @wallet, @trust, @raw, strftime('%s','now'))
        ON CONFLICT(agentId) DO UPDATE SET
          type=excluded.type,
          name=excluded.name,
          description=excluded.description,
          image=excluded.image,
          a2aEndpoint=excluded.a2aEndpoint,
          ensEndpoint=excluded.ensEndpoint,
          agentWalletEndpoint=excluded.agentWalletEndpoint,
          supportedTrust=excluded.supportedTrust,
          rawJson=excluded.rawJson,
          updatedAtTime=strftime('%s','now')
      `).run({
        agentId,
        type,
        name,
        description,
        image,
        a2a: a2aEndpoint,
        ens: ensEndpoint,
        wallet: agentWalletEndpoint,
        trust: JSON.stringify(supportedTrust),
        raw: JSON.stringify(meta),
      });
      recordEvent({ transactionHash: `token:${agentId}`, logIndex: 0, blockNumber }, 'MetadataFetched', { tokenId: agentId });
    } catch {}
  }
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

async function backfill() {
  // For ERC-721, only logs-based backfill is supported
  const tip = await client.getBlockNumber();
  const to = tip - BigInt(CONFIRMATIONS);
  let from = getCheckpoint();
  if (from === 0n) from = START_BLOCK;
  if (from > to) return;

  const CHUNK = LOGS_CHUNK_SIZE > 0n ? LOGS_CHUNK_SIZE : 10n;

  for (let start = from; start <= to; start += CHUNK) {
    const end = start + (CHUNK - 1n) > to ? to : start + (CHUNK - 1n);

    const logs = await client.getLogs({
      address,
      fromBlock: start,
      toBlock: end,
    });

    for (const log of logs) {
      try {
        const decoded = decodeEventLog({ abi: identityRegistryAbi, data: log.data, topics: log.topics });
        switch (decoded.eventName) {
          case 'Transfer': {
            const { from, to, tokenId } = decoded.args as any;
            const uri = await tryReadTokenURI(tokenId as bigint);
            await upsertFromTransfer(to as string, tokenId as bigint, log.blockNumber!, uri);
            recordEvent(log, 'Transfer', { from, to, tokenId: toDecString(tokenId) });
            break;
          }
          case 'Approval': {
            recordEvent(log, 'Approval', { ...(decoded.args as any), tokenId: toDecString((decoded.args as any).tokenId) });
            break;
          }
          case 'ApprovalForAll': {
            recordEvent(log, 'ApprovalForAll', decoded.args);
            break;
          }
          case 'MetadataSet': {
            recordEvent(log, 'MetadataSet', { ...(decoded.args as any), agentId: toDecString((decoded.args as any).agentId) });
            break;
          }
          case 'MetadataDeleted': {
            recordEvent(log, 'MetadataDeleted', { ...(decoded.args as any), agentId: toDecString((decoded.args as any).agentId) });
            break;
          }
          default:
            // ignore other events
            break;
        }
      } catch {
        // skip non-registry logs
      }
    }

    setCheckpoint(end);
    console.log(`Backfilled ${start} → ${end}`);
  }
}

async function backfillByIds() {
  // Optional ID-based backfill for sequential tokenIds starting at 1
  async function idExists(id: bigint): Promise<boolean> {
    try {
      return await client.readContract({ address, abi: identityRegistryAbi, functionName: 'exists', args: [id] }) as boolean;
    } catch {
      return false;
    }
  }

  // Exponential + binary search to find max existing tokenId
  let lo = 0n;
  let hi = 1n;
  while (await idExists(hi)) { lo = hi; hi <<= 1n; }
  let left = lo + 1n;
  let right = hi;
  let max = lo;
  while (left <= right) {
    const mid = (left + right) >> 1n;
    if (await idExists(mid)) { max = mid; left = mid + 1n; } else { right = mid - 1n; }
  }

  if (max === 0n) {
    console.log('No tokens found via ID scan.');
    return;
  }

  console.log(`ID backfill: scanning 1 → ${max}`);
  for (let id = 1n; id <= max; id++) {
    try {
      const owner = await client.readContract({ address, abi: identityRegistryAbi, functionName: 'ownerOf', args: [id] }) as string;
      const uri = await tryReadTokenURI(id);
      console.info("............uri: ", uri)
      await upsertFromTransfer(owner, id, 0n, uri);
    } catch {
      // skip gaps or read errors
    }
  }
}

function watch() {
  const unsubs = [
    client.watchContractEvent({ address, abi: identityRegistryAbi, eventName: 'Transfer', onLogs: async (logs) => {
      for (const log of logs) {
        const { from, to, tokenId } = log.args as any;
        const uri = await tryReadTokenURI(tokenId as bigint);
        await upsertFromTransfer(to as string, tokenId as bigint, log.blockNumber!, uri);
        recordEvent(log, 'Transfer', { from, to, tokenId: toDecString(tokenId) });
        setCheckpoint(log.blockNumber!);
      }
    }}),
    client.watchContractEvent({ address, abi: identityRegistryAbi, eventName: 'Approval', onLogs: (logs) => {
      for (const log of logs) {
        recordEvent(log, 'Approval', { ...(log.args as any), tokenId: toDecString((log.args as any).tokenId) });
        setCheckpoint(log.blockNumber!);
      }
    }}),
    client.watchContractEvent({ address, abi: identityRegistryAbi, eventName: 'ApprovalForAll', onLogs: (logs) => {
      for (const log of logs) {
        recordEvent(log, 'ApprovalForAll', log.args);
        setCheckpoint(log.blockNumber!);
      }
    }}),
    client.watchContractEvent({ address, abi: identityRegistryAbi, eventName: 'MetadataSet', onLogs: (logs) => {
      for (const log of logs) {
        recordEvent(log, 'MetadataSet', { ...(log.args as any), agentId: toDecString((log.args as any).agentId) });
        setCheckpoint(log.blockNumber!);
      }
    }}),
    client.watchContractEvent({ address, abi: identityRegistryAbi, eventName: 'MetadataDeleted', onLogs: (logs) => {
      for (const log of logs) {
        recordEvent(log, 'MetadataDeleted', { ...(log.args as any), agentId: toDecString((log.args as any).agentId) });
        setCheckpoint(log.blockNumber!);
      }
    }}),
  ];
  return () => unsubs.forEach((u) => u?.());
}

(async () => {
  if ((BACKFILL_MODE ?? '').toLowerCase() === 'ids') {
    await backfillByIds();
  } else {
    await backfill();
  }
  const unwatch = watch();
  console.log("Indexer running. Press Ctrl+C to exit.");
  process.on('SIGINT', () => { unwatch(); process.exit(0); });
})();
