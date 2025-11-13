-- Migration: Update didName format from did:ens:name to did:ens:chainId:name
-- This migration updates existing records that have the old format to the new format
-- Only updates records where the name ends with '.eth' (required for did:ens)

-- Update didName from did:ens:name to did:ens:chainId:name
-- Pattern: did:ens:name -> did:ens:chainId:name
-- We identify old format by checking if it starts with 'did:ens:' and has exactly 2 colons (did:ens:name)
-- New format has 3 colons (did:ens:chainId:name)
-- Extract name by removing 'did:ens:' prefix (8 characters)
UPDATE agents 
SET didName = 'did:ens:' || chainId || ':' || SUBSTR(didName, 9) 
WHERE didName IS NOT NULL 
  AND didName LIKE 'did:ens:%'
  -- Check that it's old format: starts with 'did:ens:' followed by name (no chainId)
  -- Old format: did:ens:name.eth (has 2 colons total: after 'did' and after 'ens')
  -- New format: did:ens:chainId:name.eth (has 3 colons total: after 'did', after 'ens', after chainId)
  -- Count colons: old format has exactly 2, new format has 3 or more
  AND (LENGTH(didName) - LENGTH(REPLACE(didName, ':', ''))) = 2  -- Old format has exactly 2 colons
  -- Ensure the extracted name (after 'did:ens:') ends with .eth and is a valid ENS name
  AND SUBSTR(didName, 9) LIKE '%.eth'  -- Name must end with .eth (required for did:ens)
  -- Double-check that agentName also ends with .eth (source of truth)
  AND agentName IS NOT NULL 
  AND agentName LIKE '%.eth';

-- Also populate didName for records that don't have it yet but have a valid ENS name
UPDATE agents 
SET didName = 'did:ens:' || chainId || ':' || agentName 
WHERE didName IS NULL 
  AND agentName IS NOT NULL 
  AND agentName LIKE '%.eth';

