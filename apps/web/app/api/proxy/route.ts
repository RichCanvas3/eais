import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const target = searchParams.get('url');
    if (!target) {
      return NextResponse.json({ error: 'url query param is required' }, { status: 400 });
    }

    // Server-side fetch to avoid browser mixed-content/CORS issues
    const res = await fetch(target, { headers: { accept: 'application/json' } });
    // Try JSON first
    try {
      const json = await res.clone().json();
      return NextResponse.json(json, { status: 200 });
    } catch {
      // Fallback: read text to inspect; if looks like JSON, attempt parse
      try {
        const text = await res.text();
        const trimmed = (text || '').trim();
        if (/^[{\[]/.test(trimmed)) {
          try {
            const obj = JSON.parse(trimmed);
            return NextResponse.json(obj, { status: 200 });
          } catch {}
        }
      } catch {}
      return NextResponse.json({ error: 'Upstream did not return JSON' }, { status: 415 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Proxy fetch failed' }, { status: 500 });
  }
}
