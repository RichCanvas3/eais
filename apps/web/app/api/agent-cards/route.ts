import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

function cardsDir() {
  const dir = path.resolve(process.cwd(), 'apps/web/data/cards');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}

function fileForDomain(domain: string) {
  const safe = domain.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  return path.join(cardsDir(), `${safe}.json`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const domain = (searchParams.get('domain') ?? '').trim().toLowerCase();
  if (!domain) return NextResponse.json({ error: 'Missing domain' }, { status: 400 });
  const file = fileForDomain(domain);
  try {
    if (!fs.existsSync(file)) return NextResponse.json({ found: false });
    const raw = fs.readFileSync(file, 'utf8');
    return NextResponse.json({ found: true, card: JSON.parse(raw) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Read failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const domain = String(body?.domain ?? '').trim().toLowerCase();
    const card = body?.card;
    if (!domain || !card) return NextResponse.json({ error: 'Missing domain or card' }, { status: 400 });
    const file = fileForDomain(domain);
    fs.writeFileSync(file, JSON.stringify(card, null, 2), 'utf8');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Write failed' }, { status: 500 });
  }
}


