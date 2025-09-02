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

function upsertFromArgs(args: any, blockNumber: bigint) {
  const agentId = toDecString(args.agentId);
  const agentDomain = args.agentDomain as string;
  const agentAddress = args.agentAddress as string;

  db.prepare(`
    INSERT INTO agents(agentId, agent, owner, domain, metadataURI, createdAtBlock, createdAtTime)
    VALUES(@agentId, @agent, @owner, @domain, @metadataURI, @block, strftime('%s','now'))
    ON CONFLICT(agentId) DO UPDATE SET
      agent=excluded.agent,
      domain=excluded.domain
  `).run({
    agentId,
    agent: agentAddress,
    owner: agentAddress, // owner not modeled in ABI; mirror agent for now
    domain: agentDomain,
    metadataURI: null,
    block: Number(blockNumber),
  });
}

function recordEvent(ev: any, type: string, args: any) {
  const id = `${ev.transactionHash}:${ev.logIndex}`;
  db.prepare(`INSERT OR IGNORE INTO events(id, agentId, type, blockNumber, logIndex, txHash, data)
              VALUES(@id, @agentId, @type, @block, @idx, @tx, @data)`).run({
    id,
    agentId: toDecString(args.agentId),
    type,
    block: Number(ev.blockNumber),
    idx: Number(ev.logIndex),
    tx: ev.transactionHash,
    data: JSON.stringify({ ...args, agentId: toDecString(args.agentId) })
  });
}

async function backfill() {
  if (BACKFILL_MODE === 'ids') {
    await backfillByIds();
    return;
  }
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
        if (decoded.eventName === 'AgentRegistered' || decoded.eventName === 'AgentUpdated') {
          upsertFromArgs(decoded.args, log.blockNumber!);
          recordEvent(log, decoded.eventName, decoded.args);
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
  // Read current count, iterate 1..count and upsert
  const count = await client.readContract({ address, abi: identityRegistryAbi, functionName: 'getAgentCount' }) as bigint;
  if (count === 0n) return;
  for (let id = 1n; id <= count; id++) {
    try {
      const agentInfo = await client.readContract({ address, abi: identityRegistryAbi, functionName: 'getAgent', args: [id] }) as any;
      const args = { agentId: agentInfo.agentId ?? id, agentDomain: agentInfo.agentDomain, agentAddress: agentInfo.agentAddress };
      upsertFromArgs(args, 0n);
      // Record a synthetic event for provenance (optional)
      db.prepare(`INSERT OR IGNORE INTO events(id, agentId, type, blockNumber, logIndex, txHash, data)
                  VALUES(@id, @agentId, @type, @block, @idx, @tx, @data)`).run({
        id: `bootstrap:${id}`,
        agentId: toDecString(id),
        type: 'Bootstrap',
        block: 0,
        idx: Number(id % 1_000_000n),
        tx: '0x',
        data: JSON.stringify(args)
      });
    } catch {
      // skip missing ids
    }
  }
}

function watch() {
  const unsubs = [
    client.watchEvent({ address, abi: identityRegistryAbi, eventName: 'AgentRegistered', onLogs: (logs) => {
      for (const log of logs) {
        upsertFromArgs(log.args, log.blockNumber!);
        recordEvent(log, 'AgentRegistered', log.args);
        setCheckpoint(log.blockNumber!);
      }
    }}),
    client.watchEvent({ address, abi: identityRegistryAbi, eventName: 'AgentUpdated', onLogs: (logs) => {
      for (const log of logs) {
        upsertFromArgs(log.args, log.blockNumber!);
        recordEvent(log, 'AgentUpdated', log.args);
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
