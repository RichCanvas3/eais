CREATE TABLE IF NOT EXISTS access_codes (
  address TEXT PRIMARY KEY,
  accessCode TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  lastUsedAt INTEGER
);

-- Create index for faster access code lookups
CREATE INDEX IF NOT EXISTS idx_access_codes_accessCode ON access_codes(accessCode);

