-- Expression indexes for case-insensitive search (SQLite/D1 supports indexes on expressions)
CREATE INDEX IF NOT EXISTS idx_agents_lower_agentName ON agents(LOWER(agentName));
CREATE INDEX IF NOT EXISTS idx_agents_lower_description ON agents(LOWER(description));

-- Presence and equality filters
CREATE INDEX IF NOT EXISTS idx_agents_a2aEndpoint ON agents(a2aEndpoint);
CREATE INDEX IF NOT EXISTS idx_agents_ensEndpoint ON agents(ensEndpoint);

-- Note: existing indexes already cover common filters
--   idx_agents_chainId, idx_agents_agentOwner, idx_agents_createdAtTime, idx_agents_agentName
-- Additional helpful ones (already added previously): agentId, agentAddress, description


