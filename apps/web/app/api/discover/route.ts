import { NextRequest, NextResponse } from 'next/server';

//export const dynamic = 'force-dynamic';

type InAgent = { agentId: string; agentName: string; description?: string | null };

type AgentSkill = {
  id?: string;
  name?: string;
  description?: string;
  tags?: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
};

type AgentCard = {
  name?: string;
  description?: string;
  skills?: AgentSkill[];
  [key: string]: any;
};

function getAgentCard(agentName: string): AgentCard | null {
  // Note: Filesystem access removed for Cloudflare Pages compatibility
  // Agent cards are now stored client-side only
  // Return null as cards are not available server-side
  return null;
}

type AgentWithCard = InAgent & { card?: AgentCard | null };

function buildPrompt(query: string, agents: AgentWithCard[]): string {
  const header = `You are a trust and routing assistant. Given a user query and a list of agents (with names, descriptions, and skills from their agent cards), analyze each agent and return:
1. The IDs of agents that best match the query (sorted by relevance)
2. A trust score (0-100) for each matched agent based on:
   - Quality and sentiment of feedback mentioned in their descriptions
   - Strength and credibility of their relationship network
   - Consistency and reliability indicators
   - Relevance and specificity of their skills to the query

Respond ONLY with JSON in the exact shape: 
{
  "matches": [
    { "agentId": "<id>", "trustScore": <0-100>, "reasoning": "<brief explanation>" },
    ...
  ]
}

CRITICAL Guidelines:
- ONLY include agents whose skills directly match or are relevant to the query
- If an agent's skills don't fit the query, EXCLUDE them completely from results
- Prefer agents with specific, well-documented skills that address the query
- Higher trust scores for agents with positive feedback, strong relationships, credible networks, AND relevant skills
- Include up to 10 matches. If none fit, return an empty array
- Do not add commentary or code blocks, just JSON`;

  const list = agents.map((a, i) => {
    const parts = [
      `#${i + 1} id=${a.agentId} name=${a.agentName}`,
      `Description (includes feedback & trust graph):\n${(a.description || 'No description available').toString()}`
    ];
    
    if (a.card?.skills && a.card.skills.length > 0) {
      const skillsText = a.card.skills.map((s, idx) => {
        const skillParts = [`  Skill ${idx + 1}:`];
        if (s.name) skillParts.push(`    Name: ${s.name}`);
        if (s.description) skillParts.push(`    Description: ${s.description}`);
        if (s.tags && s.tags.length > 0) skillParts.push(`    Tags: ${s.tags.join(', ')}`);
        if (s.examples && s.examples.length > 0) skillParts.push(`    Examples: ${s.examples.join('; ')}`);
        return skillParts.join('\n');
      }).join('\n');
      parts.push(`Skills:\n${skillsText}`);
    } else {
      parts.push('Skills: None documented');
    }
    
    return parts.join('\n');
  }).join('\n\n');

  return `${header}\n\nUser Query:\n${query}\n\nAgents:\n${list}`;
}

type MatchWithTrust = { agentId: string; trustScore: number; reasoning?: string };

function tryParseMatches(text: string): MatchWithTrust[] {
  try {
    const obj = JSON.parse(text);
    if (obj && Array.isArray(obj.matches)) {
      return obj.matches.map((x: any) => ({
        agentId: String(x.agentId || x),
        trustScore: typeof x.trustScore === 'number' ? x.trustScore : 50,
        reasoning: x.reasoning || undefined,
      })).filter((x: MatchWithTrust) => x.agentId);
    }
  } catch {}
  // try to extract first { ... } JSON block
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj && Array.isArray(obj.matches)) {
        return obj.matches.map((x: any) => ({
          agentId: String(x.agentId || x),
          trustScore: typeof x.trustScore === 'number' ? x.trustScore : 50,
          reasoning: x.reasoning || undefined,
        })).filter((x: MatchWithTrust) => x.agentId);
      }
    } catch {}
  }
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query ?? '').trim();
    const agents = Array.isArray(body?.agents) ? (body.agents as InAgent[]) : [];

    if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    if (!agents.length) return NextResponse.json({ matches: [] });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 400 });
    }

    // Fetch agent cards for each agent
    const agentsWithCards: AgentWithCard[] = agents.slice(0, 200).map((a) => ({
      ...a,
      card: getAgentCard(a.agentName),
    }));

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const prompt = buildPrompt(query, agentsWithCards);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a helpful assistant that responds with strict JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenAI error: ${res.status} ${errText}` }, { status: 500 });
    }

    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? '';
    const matchesWithTrust = tryParseMatches(content).slice(0, 50);

    return NextResponse.json({ matches: matchesWithTrust });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}


