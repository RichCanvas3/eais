import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type GraphNode = {
  id: string;
  label: string;
};

type GraphEdge = {
  from: string;
  to: string;
  weight?: number;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const nodes = body.nodes as GraphNode[];
    const edges = body.edges as GraphEdge[];
    const width = body.width || 600;
    const height = body.height || 400;

    if (!nodes || !Array.isArray(nodes)) {
      return NextResponse.json({ error: 'Missing nodes array' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 400 });
    }

    const graphDescription = {
      nodes: nodes.map(n => ({ id: n.id, label: n.label })),
      edges: edges?.map(e => ({ from: e.from, to: e.to, weight: e.weight })) || [],
      canvasSize: { width, height }
    };

    const prompt = `You are a graph layout expert. Given this trust graph, generate optimal 2D coordinates for each node to create a clear, well-spread visualization.

Graph data:
${JSON.stringify(graphDescription, null, 2)}

Requirements:
- Spread nodes evenly across the ${width}x${height} canvas
- Keep connected nodes reasonably close but not overlapping
- Central/important nodes (with many connections) should be more central
- Avoid node overlap (min 40px spacing)
- Keep all nodes within bounds with 30px margin

Respond ONLY with JSON in this exact format:
{
  "layout": [
    {"id": "node_id", "x": number, "y": number},
    ...
  ]
}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a graph visualization expert. Respond only with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json({ error: `OpenAI error: ${res.status} ${errText}` }, { status: 500 });
    }

    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content || '';
    
    // Parse the layout
    const layoutMatch = content.match(/\{[\s\S]*"layout"[\s\S]*\}/);
    if (!layoutMatch) {
      return NextResponse.json({ error: 'Invalid layout response from AI' }, { status: 500 });
    }

    const layoutData = JSON.parse(layoutMatch[0]);
    const layout = layoutData.layout || [];

    return NextResponse.json({ layout });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unexpected error' }, { status: 500 });
  }
}

