-- Add missing indexes for search performance optimization
-- These indexes will speed up the searchAgents GraphQL query

-- Index on agentId for exact lookups and search
CREATE INDEX IF NOT EXISTS idx_agents_agentId ON agents(agentId);

-- Index on description for search functionality
CREATE INDEX IF NOT EXISTS idx_agents_description ON agents(description);

-- Index on agentAddress for search functionality
CREATE INDEX IF NOT EXISTS idx_agents_agentAddress ON agents(agentAddress);
