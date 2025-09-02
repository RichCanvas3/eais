import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const domain = (searchParams.get("domain") ?? "").trim();
  const address = (searchParams.get("address") ?? "").trim();
  const agentId = (searchParams.get("agentId") ?? "").trim();
  const page = Number(searchParams.get("page") ?? 1);
  const pageSize = Math.min(Number(searchParams.get("pageSize") ?? 20), 100);
  const offset = (page - 1) * pageSize;

  const where: string[] = [];
  const params: any = {};

  if (domain) {
    where.push("lower(domain) LIKE lower(@domain)");
    params.domain = `%${domain}%`;
  }
  if (address) {
    where.push("lower(agent) LIKE lower(@address)");
    params.address = `%${address}%`;
  }
  if (agentId) {
    where.push("lower(agentId) LIKE lower(@agentId)");
    params.agentId = `%${agentId}%`;
  }
  if (!domain && !address && !agentId && q) {
    where.push("(lower(domain) LIKE lower(@q) OR lower(agent) LIKE lower(@q) OR lower(agentId) LIKE lower(@q))");
    params.q = `%${q}%`;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db.prepare(`
    SELECT agentId, agent as agentAddress, owner, domain as agentDomain, metadataURI, createdAtBlock, createdAtTime
    FROM agents
    ${whereSql}
    ORDER BY agentId ASC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: pageSize, offset });

  const total = db.prepare(`SELECT COUNT(1) as c FROM agents ${whereSql}`).get(params) as { c: number };

  return NextResponse.json({ page, pageSize, total: total.c, rows });
}
