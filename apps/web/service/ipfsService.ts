// Lightweight client for the external IPFS/Web3.Storage service
// Endpoints expected (from server):
// - POST   /api/web3storage/upload            { data, filename? }
// - GET    /api/web3storage/download/:cid
// - POST   /api/web3storage/credentials/save  { credentials, did }
// - GET    /api/web3storage/credentials/:did
// - DELETE /api/web3storage/credentials/:did
// - GET    /api/web3storage/status

type JsonRecord = Record<string, unknown> | unknown[] | null;

function getApiBaseUrl(): string {
  // Prefer a dedicated IPFS API base; fall back to a generic API base; then localhost
  const fromEnv =
    (process.env.NEXT_PUBLIC_IPFS_API_URL as string | undefined) ||
    (process.env.NEXT_PUBLIC_API_URL as string | undefined);
  return fromEnv && fromEnv.trim() !== "" ? fromEnv : "http://localhost:4000";
}

async function httpJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    try {
      const body = (await res.json()) as any;
      if (body?.error) message = String(body.error);
    } catch {}
    throw new Error(message);
  }
  return (await res.json()) as T;
}

class IpfsService {
  static get apiBase(): string {
    return getApiBaseUrl();
  }

  // Upload arbitrary JSON; returns CID and public gateway URL
  static async uploadJson(params: { data: JsonRecord; filename?: string }): Promise<{ cid: string; url: string }> {
    const payload = { data: params.data, filename: params.filename ?? "data.json" };
    const out = await httpJson<{ success: boolean; cid: string; url: string }>(
      "/api/web3storage/upload",
      { method: "POST", body: JSON.stringify(payload) }
    );
    return { cid: out.cid, url: out.url };
  }

  // Download JSON by CID
  static async downloadJson(cid: string): Promise<JsonRecord> {
    const out = await httpJson<{ success: boolean; data: JsonRecord }>(`/api/web3storage/download/${cid}`);
    return out.data ?? null;
  }

  // Save credentials bundle under a DID
  static async saveCredentials(params: { credentials: JsonRecord; did: string }): Promise<{ cid: string; url: string }> {
    const out = await httpJson<{ success: boolean; cid: string; url: string }>(
      "/api/web3storage/credentials/save",
      { method: "POST", body: JSON.stringify({ credentials: params.credentials, did: params.did }) }
    );
    return { cid: out.cid, url: out.url };
  }

  // Retrieve credentials for a DID (server currently returns [])
  static async getCredentials(did: string): Promise<JsonRecord> {
    const out = await httpJson<{ success: boolean; data: JsonRecord }>(`/api/web3storage/credentials/${did}`);
    return out.data ?? null;
  }

  // Delete credentials for a DID (logical delete; server may be a no-op)
  static async deleteCredentials(did: string): Promise<boolean> {
    const out = await httpJson<{ success: boolean }>(`/api/web3storage/credentials/${did}`, { method: "DELETE" });
    return Boolean(out.success);
  }

  // Service configuration and current spaces (diagnostics)
  static async getStatus(): Promise<{ configured: boolean; email?: string; spaceDid?: string; availableSpaces?: string[]; targetSpaceExists?: boolean; error?: string }> {
    return await httpJson(`/api/web3storage/status`);
  }

  // Get agent by EVM address from backend DB
  static async getAgentByAddress(address: string): Promise<any | null> {
    try {
      const base = getApiBaseUrl();
      const url = `${base}/api/agents/by-address/${address}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const out = await res.json();
      return out?.agent ?? null;
    } catch {
      return null;
    }
  }
}

export default IpfsService;

