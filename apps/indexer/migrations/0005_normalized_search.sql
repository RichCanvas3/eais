-- Add new columns to agents for common filters
ALTER TABLE agents ADD COLUMN did TEXT;
ALTER TABLE agents ADD COLUMN mcp INTEGER;           -- 0/1
ALTER TABLE agents ADD COLUMN x402support INTEGER;   -- 0/1
ALTER TABLE agents ADD COLUMN active INTEGER;        -- 0/1

-- Normalize arrays/sets for efficient filtering
CREATE TABLE IF NOT EXISTS agent_operators (
  chainId INTEGER NOT NULL,
  agentId TEXT NOT NULL,
  operator TEXT NOT NULL,
  PRIMARY KEY (chainId, agentId, operator)
);

CREATE TABLE IF NOT EXISTS agent_supported_trust (
  chainId INTEGER NOT NULL,
  agentId TEXT NOT NULL,
  trust TEXT NOT NULL,
  PRIMARY KEY (chainId, agentId, trust)
);

CREATE TABLE IF NOT EXISTS agent_skills (
  chainId INTEGER NOT NULL,
  agentId TEXT NOT NULL,
  skill TEXT NOT NULL,
  PRIMARY KEY (chainId, agentId, skill)
);

CREATE TABLE IF NOT EXISTS agent_mcp_tools (
  chainId INTEGER NOT NULL,
  agentId TEXT NOT NULL,
  tool TEXT NOT NULL,
  PRIMARY KEY (chainId, agentId, tool)
);

CREATE TABLE IF NOT EXISTS agent_mcp_prompts (
  chainId INTEGER NOT NULL,
  agentId TEXT NOT NULL,
  prompt TEXT NOT NULL,
  PRIMARY KEY (chainId, agentId, prompt)
);

CREATE TABLE IF NOT EXISTS agent_mcp_resources (
  chainId INTEGER NOT NULL,
  agentId TEXT NOT NULL,
  resource TEXT NOT NULL,
  PRIMARY KEY (chainId, agentId, resource)
);

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_agents_did ON agents(did);
CREATE INDEX IF NOT EXISTS idx_agents_mcp ON agents(mcp);
CREATE INDEX IF NOT EXISTS idx_agents_x402_support ON agents(x402support);
CREATE INDEX IF NOT EXISTS idx_agents_active ON agents(active);

-- Expression indexes for case-insensitive filtering on endpoints and did
CREATE INDEX IF NOT EXISTS idx_agents_lower_ensEndpoint ON agents(LOWER(ensEndpoint));
CREATE INDEX IF NOT EXISTS idx_agents_lower_agentAccountEndpoint ON agents(LOWER(agentAccountEndpoint));
CREATE INDEX IF NOT EXISTS idx_agents_lower_did ON agents(LOWER(did));

-- Indexes on normalized tables
CREATE INDEX IF NOT EXISTS idx_agent_operators_operator ON agent_operators(operator);
CREATE INDEX IF NOT EXISTS idx_agent_supported_trust_trust ON agent_supported_trust(trust);
CREATE INDEX IF NOT EXISTS idx_agent_skills_skill ON agent_skills(skill);
CREATE INDEX IF NOT EXISTS idx_agent_mcp_tools_tool ON agent_mcp_tools(tool);
CREATE INDEX IF NOT EXISTS idx_agent_mcp_prompts_prompt ON agent_mcp_prompts(prompt);
CREATE INDEX IF NOT EXISTS idx_agent_mcp_resources_resource ON agent_mcp_resources(resource);


