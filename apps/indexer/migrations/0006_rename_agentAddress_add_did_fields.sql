-- Migration: Add agentAccount and DID fields
-- This migration:
-- 1. Adds agentAccount column (populated from agentAddress for backward compatibility)
-- 2. Adds three new DID fields: didIdentity, didAccount, didName
-- Note: SQLite doesn't support DROP COLUMN, so agentAddress remains for backward compatibility

-- Step 1: Add new columns
ALTER TABLE agents ADD COLUMN agentAccount TEXT;
ALTER TABLE agents ADD COLUMN didIdentity TEXT;
ALTER TABLE agents ADD COLUMN didAccount TEXT;
ALTER TABLE agents ADD COLUMN didName TEXT;

-- Step 2: Populate agentAccount from agentAddress for existing records
UPDATE agents SET agentAccount = agentAddress WHERE agentAccount IS NULL AND agentAddress IS NOT NULL;

-- Step 3: Compute DID values for existing records
-- didIdentity: did:8004:chainId:agentId
UPDATE agents SET didIdentity = 'did:8004:' || chainId || ':' || agentId WHERE didIdentity IS NULL;

-- didAccount: did:ethr:chainId:agentAccount (using agentAccount if available, otherwise agentAddress)
UPDATE agents SET didAccount = 'did:ethr:' || chainId || ':' || COALESCE(agentAccount, agentAddress) 
WHERE didAccount IS NULL AND (agentAccount IS NOT NULL OR agentAddress IS NOT NULL);

-- didName: did:ens:chainId:agentName (only if agentName ends with .eth)
UPDATE agents SET didName = 'did:ens:' || chainId || ':' || agentName WHERE didName IS NULL AND agentName LIKE '%.eth';

-- Note: The agentAddress column remains in the database for backward compatibility
-- The application code uses agentAccount going forward, with fallback to agentAddress

