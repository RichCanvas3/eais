import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const name = (searchParams.get("name") ?? "").trim();
  const address = (searchParams.get("address") ?? "").trim();
  const agentId = (searchParams.get("agentId") ?? "").trim();
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 20), 100);
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: any = {};

  console.info("............filter list: ", name, address, agentId, q)


  if (name) {
    // Match display name: ENS endpoint path or metadata agentName
    where.push("(lower(m.ensEndpoint) LIKE lower(@name) OR lower(m.agentName) LIKE lower(@name))");
    params.name = `%${name}%`;
  }
  if (address) {
    where.push("lower(agentAddress) LIKE lower(@address)");
    params.address = `%${address}%`;
  }
  if (agentId) {
    where.push("(a.agentId = @agentIdExact OR lower(a.agentId) LIKE lower(@agentIdLike))");
    params.agentIdExact = agentId;
    params.agentIdLike = `%${agentId}%`;
  }


  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  console.info("............whereSql: ", whereSql)

  const rows = db.prepare(`
    SELECT a.agentId,
           a.agentAddress,
            a.agentOwner,
           a.metadataURI,
           a.createdAtBlock,
           a.createdAtTime,
           m.agentName,
           m.description as description,
           m.a2aEndpoint as a2aEndpoint,
           m.ensEndpoint as ensEndpoint
    FROM agents a
    LEFT JOIN agent_metadata m ON m.agentId = a.agentId
    ${whereSql}
    ORDER BY a.agentId ASC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset });

  const total = db.prepare(`
    SELECT COUNT(1) as c
    FROM agents a
    LEFT JOIN agent_metadata m ON m.agentId = a.agentId
    ${whereSql}
  `).get(params) as { c: number };

  return NextResponse.json({ page, pageSize, total: total.c, rows });
}
