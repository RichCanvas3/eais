'use client';
import * as React from 'react';
import { buildDid8004 } from '@agentic-trust/core';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Paper, Stack } from '@mui/material';

type GraphNode = {
  id: string;
  label: string;
  type?: string;
  x?: number;
  y?: number;
};

type GraphEdge = {
  from: string;
  to: string;
  weight?: number;
  label?: string;
};

type TrustGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type TrustGraphModalProps = {
  open: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
};

function parseTrustGraph(description: string | null): TrustGraphData | null {
  if (!description) return null;

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeSet = new Set<string>();

  // Try to parse as JSON first
  try {
    // Clean up JSON while preserving URLs (don't remove // inside strings)
    // First remove block comments /* ... */
    let cleanedDescription = description.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // DON'T remove // comments because they might be part of URLs like https://
    // Instead, just normalize whitespace
    cleanedDescription = cleanedDescription
      // Replace ALL Unicode whitespace variants with regular space
      .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
      // Normalize line breaks
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .trim();
    
    console.log('Attempting to parse cleaned JSON...');
    console.log('First 200 chars:', cleanedDescription.substring(0, 200));
    console.log('Description length:', cleanedDescription.length);
    console.log('Description type:', typeof cleanedDescription);
    
    let parsed;
    try {
      parsed = JSON.parse(cleanedDescription);
      console.log('Successfully parsed JSON:', parsed);
      console.log('Parsed type:', typeof parsed);
      console.log('Has nodes?', Array.isArray(parsed?.nodes));
      console.log('Has trust_atoms?', Array.isArray(parsed?.trust_atoms));
    } catch (parseErr) {
      console.error('JSON.parse error:', parseErr);
      console.error('Error message:', (parseErr as Error).message);
      
      // Try to identify the problematic character
      const match = (parseErr as Error).message.match(/position (\d+)/);
      if (match) {
        const pos = parseInt(match[1]);
        console.error('Context around error position:', {
          before: cleanedDescription.substring(Math.max(0, pos - 50), pos),
          at: cleanedDescription.substring(pos, pos + 1),
          after: cleanedDescription.substring(pos + 1, Math.min(cleanedDescription.length, pos + 51)),
          charCode: cleanedDescription.charCodeAt(pos)
        });
      }
      
      throw parseErr;
    }
    
    // Handle double-stringified JSON (check if result is a string and try parsing again)
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // Keep the first parse result
      }
    }
    
    // Handle various JSON structures
    if (parsed) {
      // Look for nodes array - filter out Person type nodes
      if (Array.isArray(parsed.nodes)) {
        parsed.nodes.forEach((node: any) => {
          const id = node.id || node.name || String(node);
          const label = node.label || node.name || id;
          const type = node.type;
          
          // Skip Person nodes - we'll aggregate feedback instead
          if (type === 'Person' || id.startsWith('person.')) {
            return;
          }
          
          nodeSet.add(id);
          nodes.push({ id, label, type });
        });
      }
      
      // Look for edges/relationships array (various formats)
      const edgesArray = parsed.edges || parsed.relationships || parsed.links || parsed.trust_atoms;
      const feedbackEdges: Array<{ score: number; comment?: string }> = [];
      let feedbackTarget: string | null = null;
      
      if (Array.isArray(edgesArray)) {
        edgesArray.forEach((edge: any) => {
          // Standard edge format
          const from = edge.from || edge.source || edge.start || edge.subj;
          const to = edge.to || edge.target || edge.end || edge.obj;
          const pred = edge.pred || edge.predicate || edge.type;
          const weight = edge.weight || edge.score || edge.trust || edge.attrs?.score || edge.attrs?.match_score;
          
          // Check if this is a feedback edge (person giving feedback to agent)
          if (pred === 'gave_feedback_to' || (from && from.startsWith('person.') && to)) {
            if (typeof weight === 'number') {
              feedbackEdges.push({
                score: weight,
                comment: edge.attrs?.comment
              });
              feedbackTarget = String(to);
            }
            return; // Skip adding this as a regular edge
          }
          
          // Skip edges from Person nodes
          if (from && from.startsWith('person.')) {
            return;
          }
          
          if (from && to) {
            nodeSet.add(from);
            nodeSet.add(to);
            edges.push({
              from: String(from),
              to: String(to),
              weight: typeof weight === 'number' ? weight : undefined,
              label: weight !== undefined ? String(weight) : undefined,
            });
          }
        });
        
        // Store feedback summary but don't create a node (we show it separately at top)
        // Just skip adding feedback edges to the graph
        if (feedbackEdges.length > 0 && feedbackTarget) {
          const avgScore = feedbackEdges.reduce((sum, f) => sum + f.score, 0) / feedbackEdges.length;
          console.log(`Aggregating ${feedbackEdges.length} feedback items with avg score ${avgScore.toFixed(2)}`);
          // Note: feedback summary will be extracted later for display, no node/edge added here
        }
      }
      
      console.log(`JSON parsing result: ${nodes.length} nodes, ${edges.length} edges`);
      console.log('Nodes:', nodes.map(n => n.id));
      console.log('Edges:', edges.map(e => `${e.from} -> ${e.to}`));
      
      // If we found edges but no explicit nodes, create nodes from edges
      if (edges.length > 0 && nodes.length === 0) {
        console.log('Creating nodes from edges');
        nodeSet.forEach(id => {
          nodes.push({ id, label: id });
        });
      }
      
      // If we have a graph structure, return it
      if (nodes.length > 0 && edges.length > 0) {
        console.log(`Returning parsed graph structure with ${nodes.length} nodes and ${edges.length} edges`);
        return { nodes, edges };
      }
      
      // Also return if we have nodes even without edges (better to show something)
      if (nodes.length > 0) {
        console.log(`Returning graph with ${nodes.length} nodes but no edges`);
        return { nodes, edges: [] };
      }
      
      console.log('No valid graph structure found in JSON');
    }
  } catch (e) {
    console.error('JSON parsing failed:', e);
    // Not JSON, fall through to text parsing
  }

  // Pattern 1: Look for "trust graph:" or "relationships:" sections
  const graphMatch = description.match(/(?:trust\s+graph|relationships?):\s*([^\n]+(?:\n(?!\n)[^\n]+)*)/i);
  if (graphMatch) {
    const graphText = graphMatch[1];
    
    // Parse edges like "A -> B (0.9)" or "A trusts B: 0.8"
    const edgePatterns = [
      /([a-zA-Z0-9_-]+)\s*->\s*([a-zA-Z0-9_-]+)(?:\s*\(([0-9.]+)\))?/g,
      /([a-zA-Z0-9_-]+)\s+trusts\s+([a-zA-Z0-9_-]+)(?::\s*([0-9.]+))?/gi,
      /([a-zA-Z0-9_-]+)\s*→\s*([a-zA-Z0-9_-]+)(?:\s*\(([0-9.]+)\))?/g,
    ];

    edgePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(graphText)) !== null) {
        const from = match[1].trim();
        const to = match[2].trim();
        const weight = match[3] ? parseFloat(match[3]) : undefined;
        
        nodeSet.add(from);
        nodeSet.add(to);
        edges.push({ from, to, weight, label: weight ? `${weight}` : undefined });
      }
    });
  }

  // Pattern 2: Look for node lists
  const nodeMatch = description.match(/(?:nodes?|agents?):\s*([^\n]+)/i);
  if (nodeMatch) {
    const nodeText = nodeMatch[1];
    const nodeNames = nodeText.split(/[,;]/).map(n => n.trim()).filter(Boolean);
    nodeNames.forEach(n => nodeSet.add(n));
  }

  // Create nodes from discovered entities
  nodeSet.forEach(id => {
    if (!nodes.find(n => n.id === id)) {
      nodes.push({ id, label: id });
    }
  });

  if (nodes.length === 0 || edges.length === 0) return null;

  return { nodes, edges };
}

async function layoutGraphWithAI(data: TrustGraphData, width: number, height: number): Promise<TrustGraphData> {
  const { nodes, edges } = data;
  
  // Call server-side API for layout generation
  const res = await fetch('/api/graph-layout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      nodes: nodes.map(n => ({ id: n.id, label: n.label })),
      edges: edges.map(e => ({ from: e.from, to: e.to, weight: e.weight })),
      width,
      height
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({} as any));
    throw new Error(err?.error || 'Layout generation failed');
  }

  const json = await res.json();
  const layout = json.layout || [];

  // Apply coordinates to nodes
  nodes.forEach(node => {
    const pos = layout.find((l: any) => l.id === node.id);
    if (pos) {
      node.x = pos.x;
      node.y = pos.y;
    } else {
      // Fallback to random position if not found
      node.x = Math.random() * (width - 60) + 30;
      node.y = Math.random() * (height - 60) + 30;
    }
  });

  return { nodes, edges };
}

function layoutGraph(data: TrustGraphData, width: number, height: number): TrustGraphData {
  const { nodes, edges } = data;
  
  // Find agent node
  const agentNode = nodes.find(n => n.id && (n.id.startsWith('agent.') || n.type === 'Agent'));
  
  const centerX = width / 2;
  
  // Position agent node at top center (fixed position)
  if (agentNode) {
    agentNode.x = centerX;
    agentNode.y = 80;
  }

  // Position all other nodes below agent in a grid pattern
  const otherNodes = nodes.filter(n => n.id !== agentNode?.id);
  
  // Distribute other nodes in a grid below the agent
  const startY = 250;
  const availableHeight = height - startY - 50;
  const availableWidth = width - 100;
  const cols = Math.min(6, Math.ceil(Math.sqrt(otherNodes.length * 1.5))); // Wider grid
  const rows = Math.ceil(otherNodes.length / cols);
  const spacingX = availableWidth / (cols + 1);
  const spacingY = availableHeight / (rows + 1);
  
  otherNodes.forEach((node, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    node.x = 50 + (col + 1) * spacingX;
    node.y = startY + (row + 1) * spacingY;
  });

  // Improved force simulation (only for other nodes, not agent)
  for (let iter = 0; iter < 80; iter++) {
    // Repulsion between other nodes
    for (let i = 0; i < otherNodes.length; i++) {
      for (let j = i + 1; j < otherNodes.length; j++) {
        const dx = otherNodes[j].x! - otherNodes[i].x!;
        const dy = otherNodes[j].y! - otherNodes[i].y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = 4000 / (dist * dist); // Strong repulsion for spread
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        otherNodes[i].x! -= fx;
        otherNodes[i].y! -= fy;
        otherNodes[j].x! += fx;
        otherNodes[j].y! += fy;
      }
    }

    // Attraction along edges (only if both nodes are not the agent)
    edges.forEach(edge => {
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      if (from && to && 
          from.id !== agentNode?.id &&
          to.id !== agentNode?.id) {
        const dx = to.x! - from.x!;
        const dy = to.y! - from.y!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (dist - 120) * 0.08;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        from.x! += fx;
        from.y! += fy;
        to.x! -= fx;
        to.y! -= fy;
      }
    });
  }

  // Ensure all nodes are within bounds (except agent which stays at top)
  nodes.forEach(node => {
    if (node.id === agentNode?.id) {
      // Keep agent at top center
      node.x = centerX;
      node.y = 80;
    } else {
      node.x = Math.max(50, Math.min(width - 50, node.x!));
      node.y = Math.max(50, Math.min(height - 50, node.y!));
    }
  });

  return { nodes, edges };
}

export function TrustGraphModal({ open, onClose, agentId, agentName }: TrustGraphModalProps) {
  const [description, setDescription] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [graphData, setGraphData] = React.useState<TrustGraphData | null>(null);
  const [layoutLoading, setLayoutLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open || !agentId) {
      setDescription(null);
      setError(null);
      setGraphData(null);
      return;
    }

    async function fetchAgentData() {
      setLoading(true);
      setError(null);
      try {
        // Build did:8004 identifier (no chainId context here, so use default did:8004:<agentId>)
        const did8004 = `did:8004:${agentId}`;
        const res = await fetch(`/api/agents/${encodeURIComponent(did8004)}`);
        if (!res.ok) {
          throw new Error('Failed to fetch agent data');
        }
        const data = await res.json();
        setDescription(data.description || null);
      } catch (e: any) {
        setError(e?.message || 'Failed to load agent data');
      } finally {
        setLoading(false);
      }
    }

    fetchAgentData();
  }, [open, agentId]);

  const [feedbackSummary, setFeedbackSummary] = React.useState<{ count: number; avgScore: number } | null>(null);

  React.useEffect(() => {
    if (!description) {
      setGraphData(null);
      setFeedbackSummary(null);
      return;
    }

    async function generateLayout() {
      console.log('TrustGraphModal - Raw description:', description);
      const parsed = parseTrustGraph(description);
      console.log('TrustGraphModal - Parsed graph data:', parsed);
      
      if (!parsed) {
        setGraphData(null);
        setFeedbackSummary(null);
        return;
      }

      // Extract feedback summary by re-parsing the description for feedback data
      try {
        if (!description) {
          setFeedbackSummary(null);
        } else {
          const cleanedDesc = description
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
            .trim();
          const parsedForFeedback = JSON.parse(cleanedDesc);
          const trustAtoms = parsedForFeedback?.trust_atoms || [];
          const feedbackItems = trustAtoms.filter((atom: any) => 
            atom.pred === 'gave_feedback_to' && atom.attrs?.score !== undefined
          );
          
          if (feedbackItems.length > 0) {
            const totalScore = feedbackItems.reduce((sum: number, item: any) => sum + (item.attrs.score || 0), 0);
            const avgScore = totalScore / feedbackItems.length;
            setFeedbackSummary({ count: feedbackItems.length, avgScore });
          } else {
            setFeedbackSummary(null);
          }
        }
      } catch {
        setFeedbackSummary(null);
      }

      // Try AI-enhanced layout first
      setLayoutLoading(true);
      try {
        console.log('Attempting AI-enhanced layout...');
        const layouted = await layoutGraphWithAI(parsed, 1400, 700);
        console.log('✅ AI layout successful!');
        setGraphData(layouted);
      } catch (e) {
        console.warn('⚠️ AI layout failed, using fallback:', e);
        // Fallback to simple force-directed layout
        const fallback = layoutGraph(parsed, 1400, 700);
        console.log('Using fallback force-directed layout');
        setGraphData(fallback);
      } finally {
        setLayoutLoading(false);
      }
    }

    generateLayout();
  }, [description]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Trust Graph — {agentName}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Typography variant="body2" color="text.secondary">
            Loading agent data...
          </Typography>
        ) : layoutLoading ? (
          <Typography variant="body2" color="text.secondary">
            Generating AI-optimized graph layout...
          </Typography>
        ) : error ? (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        ) : !graphData ? (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              No trust graph data found in agent description.
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Expected JSON format with "nodes" and "edges" arrays, or text format like "A -&gt; B (0.9)"
            </Typography>
            {description && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1, maxHeight: '400px', overflow: 'auto' }}>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                  Raw Description Data:
                </Typography>
                <Typography component="pre" variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.7rem' }}>
                  {description}
                </Typography>
              </Box>
            )}
          </Box>
        ) : (
          <>
            {/* Feedback Summary Display */}
            {feedbackSummary && (
              <Paper 
                variant="outlined" 
                sx={{ 
                  p: 2.5, 
                  mb: 2, 
                  bgcolor: '#fff3e0',
                  borderColor: '#ff9800',
                  borderWidth: 2
                }}
              >
                <Stack direction="row" spacing={3} alignItems="center" justifyContent="center">
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h3" sx={{ fontWeight: 700, color: '#f57c00', mb: 0.5 }}>
                      {feedbackSummary.avgScore.toFixed(2)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                      Average Score
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="h4" sx={{ fontWeight: 600, color: '#333' }}>
                      {feedbackSummary.count}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                      Client Reviews
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            )}

            {/* Graph Visualization */}
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ width: '100%', border: '1px solid #e0e0e0', borderRadius: 1 }}>
                <svg width="100%" height="700" viewBox="0 0 1400 700" style={{ display: 'block' }}>
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="7"
                    refX="9"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#666" />
                  </marker>
                </defs>

                {/* Draw edges */}
                {graphData.edges.map((edge, i) => {
                  const from = graphData.nodes.find(n => n.id === edge.from);
                  const to = graphData.nodes.find(n => n.id === edge.to);
                  if (!from || !to) return null;

                  const dx = to.x! - from.x!;
                  const dy = to.y! - from.y!;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  
                  // Adjust offset based on node type (agent is slightly larger)
                  const isFromAgent = from.type === 'Agent' || from.id?.startsWith('agent.');
                  const isToAgent = to.type === 'Agent' || to.id?.startsWith('agent.');
                  const fromRadius = isFromAgent ? 18 : 12;
                  const toRadius = isToAgent ? 18 : 12;
                  const offsetFromX = (dx / dist) * fromRadius;
                  const offsetFromY = (dy / dist) * fromRadius;
                  const offsetToX = (dx / dist) * toRadius;
                  const offsetToY = (dy / dist) * toRadius;

                  const midX = (from.x! + to.x!) / 2;
                  const midY = (from.y! + to.y!) / 2;

                  // Highlight edges connected to agent
                  const isAgentEdge = isFromAgent || isToAgent;

                  return (
                    <g key={i}>
                      <line
                        x1={from.x! + offsetFromX}
                        y1={from.y! + offsetFromY}
                        x2={to.x! - offsetToX}
                        y2={to.y! - offsetToY}
                        stroke={isAgentEdge ? "#1976d2" : "#999"}
                        strokeWidth={isAgentEdge ? "2.5" : "1.5"}
                        markerEnd="url(#arrowhead)"
                        opacity={isAgentEdge ? 0.8 : 0.4}
                      />
                      {edge.label && (
                        <text
                          x={midX}
                          y={midY - 5}
                          fontSize="9"
                          fill={isAgentEdge ? "#1976d2" : "#666"}
                          textAnchor="middle"
                          fontWeight="600"
                        >
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Draw nodes */}
                {graphData.nodes.map((node, i) => {
                  const isAgent = node.type === 'Agent' || node.id?.startsWith('agent.');
                  const radius = isAgent ? 18 : 12;
                  const fontSize = isAgent ? 10 : 8;
                  const fill = isAgent ? '#1976d2' : '#90caf9';
                  
                  return (
                    <g key={i}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={radius}
                        fill={fill}
                        stroke="#fff"
                        strokeWidth={isAgent ? "3" : "2"}
                        opacity={isAgent ? 1 : 0.85}
                      />
                      <text
                        x={node.x}
                        y={node.y! + radius + 14}
                        fontSize={fontSize}
                        fill="#333"
                        textAnchor="middle"
                        fontWeight={isAgent ? "700" : "500"}
                      >
                        {node.label.split('\n').map((line, idx) => (
                          <tspan key={idx} x={node.x} dy={idx === 0 ? 0 : fontSize + 2}>
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </Box>

            <Box sx={{ mt: 2 }}>
              <Typography variant="caption" color="text.secondary">
                Graph shows trust relationships from agent description.
                Agent node (dark blue) is at the top. Arrows indicate relationship direction, labels show scores.
                Scroll to explore the full graph.
              </Typography>
            </Box>
          </Paper>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

