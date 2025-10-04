// Lightweight client for the external Identity service (formerly identity-service)
// Endpoints expected (from server):
// - POST   /api/web3storage/upload            { data, filename? }
// - GET    /api/web3storage/download/:cid
// - GET    /api/agents/by-address/:address
// - GET    /api/agents/by-name/:name

type JsonRecord = Record<string, unknown> | unknown[] | null;

function getApiBaseUrl(): string {
  const fromEnv =
    (process.env.NEXT_PUBLIC_IDENTITY_API_URL as string | undefined) ||
    (process.env.NEXT_PUBLIC_API_URL as string | undefined) ||
    (process.env.NEXT_PUBLIC_IDENTITY_API_URL as string | undefined); // backward compat
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

class IdentityService {
  static get apiBase(): string {
    return getApiBaseUrl();
  }

  static async uploadJson(params: { data: JsonRecord; filename?: string }): Promise<{ cid: string; url: string }> {
    const payload = { data: params.data, filename: params.filename ?? "data.json" };
    const out = await httpJson<{ success: boolean; cid: string; url: string }>(
      "/api/web3storage/upload",
      { method: "POST", body: JSON.stringify(payload) }
    );
    return { cid: out.cid, url: out.url };
  }

  static async downloadJson(cid: string): Promise<JsonRecord> {
    const out = await httpJson<{ success: boolean; data: JsonRecord }>(`/api/web3storage/download/${cid}`);
    return out.data ?? null;
  }

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

  static async getAgentByName(name: string): Promise<any | null> {
    try {
      const base = getApiBaseUrl();
      const url = `${base}/api/agents/by-name/${encodeURIComponent(name)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const out = await res.json();
      return out?.agent ?? null;
    } catch {
      return null;
    }
  }
}

export default IdentityService;


