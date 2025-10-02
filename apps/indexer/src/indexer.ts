import { createPublicClient, http, webSocket, type Address, decodeEventLog } from "viem";
import { identityRegistryAbi } from "./abi/identityRegistry";
import { db, getCheckpoint, setCheckpoint } from "./db";
import { REGISTRY_ADDRESS, RPC_HTTP_URL, RPC_WS_URL, CONFIRMATIONS, START_BLOCK, LOGS_CHUNK_SIZE, BACKFILL_MODE } from "./env";

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

function upsertFromTransfer(to: string, tokenId: bigint, blockNumber: bigint, tokenURI: string | null) {
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
            upsertFromTransfer(to as string, tokenId as bigint, log.blockNumber!, uri);
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
  // Not supported for ERC-721 indexer; rely on logs-based backfill
  return;
}

function watch() {
  const unsubs = [
    client.watchContractEvent({ address, abi: identityRegistryAbi, eventName: 'Transfer', onLogs: async (logs) => {
      for (const log of logs) {
        const { from, to, tokenId } = log.args as any;
        const uri = await tryReadTokenURI(tokenId as bigint);
        upsertFromTransfer(to as string, tokenId as bigint, log.blockNumber!, uri);
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
  await backfill();
  const unwatch = watch();
  console.log("Indexer running. Press Ctrl+C to exit.");
  process.on('SIGINT', () => { unwatch(); process.exit(0); });
})();
