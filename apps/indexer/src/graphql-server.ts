#!/usr/bin/env node
import 'dotenv/config';
import { createGraphQLServer } from './graphql';
import { GRAPHQL_SERVER_PORT } from './env';

console.log('🎯 Starting ERC8004 Indexer GraphQL Server...');
console.log(`📡 Port: ${GRAPHQL_SERVER_PORT}`);

const server = createGraphQLServer(GRAPHQL_SERVER_PORT);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down GraphQL server...');
  server.close(() => {
    console.log('✅ GraphQL server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down GraphQL server...');
  server.close(() => {
    console.log('✅ GraphQL server closed');
    process.exit(0);
  });
});

