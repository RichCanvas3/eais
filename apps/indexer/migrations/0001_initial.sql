CREATE TABLE IF NOT EXISTS agents (
  chainId INTEGER NOT NULL,
  agentId TEXT NOT NULL,
  agentAddress TEXT NOT NULL,
  agentOwner TEXT NOT NULL,
  agentName TEXT NOT NULL,
  metadataURI TEXT,
  createdAtBlock INTEGER NOT NULL,
  createdAtTime INTEGER NOT NULL,
  type TEXT,
  description TEXT,
  image TEXT,
  a2aEndpoint TEXT,
  ensEndpoint TEXT,
  agentAccountEndpoint TEXT,
  supportedTrust TEXT,
  rawJson TEXT,
  updatedAtTime INTEGER,
  PRIMARY KEY (chainId, agentId)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  agentId TEXT NOT NULL,
  type TEXT NOT NULL,
  blockNumber INTEGER NOT NULL,
  logIndex INTEGER NOT NULL,
  txHash TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkpoints (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_agents_chainId ON agents(chainId);
CREATE INDEX IF NOT EXISTS idx_agents_agentOwner ON agents(agentOwner);
CREATE INDEX IF NOT EXISTS idx_agents_createdAtTime ON agents(createdAtTime);
CREATE INDEX IF NOT EXISTS idx_agents_agentName ON agents(agentName);

