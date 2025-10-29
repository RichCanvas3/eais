#!/usr/bin/env tsx
/**
 * Script to sync data from local SQLite database to Cloudflare D1
 * Run this periodically to keep D1 in sync with the indexer
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment
const DB_PATH = process.env.DB_PATH ?? './data/registry.db';
const db = new Database(DB_PATH);

async function syncToD1() {
  console.log('🔄 Starting sync from local SQLite to Cloudflare D1...');
  
  // Get all agents from local database
  const agents = db.prepare('SELECT * FROM agents').all() as any[];
  console.log(`📊 Found ${agents.length} agents to sync`);
  
  if (agents.length === 0) {
    console.log('✅ No agents to sync');
    return;
  }
  
  // Generate SQL INSERT statements
  const inserts: string[] = [];
  
  for (const agent of agents) {
    const values = [
      agent.chainId,
      agent.agentId,
      agent.agentAddress,
      agent.agentOwner,
      agent.agentName || '',
      agent.metadataURI || null,
      agent.createdAtBlock,
      agent.createdAtTime,
      agent.type || null,
      agent.description || null,
      agent.image || null,
      agent.a2aEndpoint || null,
      agent.ensEndpoint || null,
      agent.agentAccountEndpoint || null,
      agent.supportedTrust || null,
      agent.rawJson || null,
      agent.updatedAtTime || null,
    ];
    
    // Use INSERT OR REPLACE to handle conflicts
    const sql = `INSERT OR REPLACE INTO agents (
      chainId, agentId, agentAddress, agentOwner, agentName, metadataURI,
      createdAtBlock, createdAtTime, type, description, image,
      a2aEndpoint, ensEndpoint, agentAccountEndpoint, supportedTrust,
      rawJson, updatedAtTime
    ) VALUES (
      ${values.map((v, i) => 
        v === null ? 'NULL' : 
        typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : 
        v
      ).join(', ')}
    )`;
    
    inserts.push(sql);
  }
  
  // Write to a file that can be executed by wrangler
  const outputFile = path.join(__dirname, '../migrations/sync_to_d1.sql');
  const fs = await import('fs/promises');
  await fs.writeFile(outputFile, inserts.join(';\n') + ';', 'utf-8');
  
  console.log(`✅ Generated sync file: ${outputFile}`);
  console.log(`📝 To apply to D1, run:`);
  console.log(`   wrangler d1 execute erc8004-indexer --remote --file=${outputFile}`);
}

syncToD1().catch(console.error).finally(() => db.close());

