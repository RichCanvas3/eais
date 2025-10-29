# GraphQL API Documentation

The indexer provides a GraphQL endpoint that allows other web applications to query agents from the database.

## Starting the Server

```bash
cd apps/indexer
pnpm dev:graphql
# or
pnpm start:graphql
```

The server will start on port 4000 by default (configurable via `GRAPHQL_SERVER_PORT` environment variable).

- **GraphQL Endpoint**: `http://localhost:4000/graphql`
- **GraphiQL Playground**: `http://localhost:4000/graphql` (interactive query browser)
- **Health Check**: `http://localhost:4000/health`

## Environment Variables

Add to your `.env` file:

```env
GRAPHQL_SERVER_PORT=4000
```

## GraphQL Queries

### Query All Agents

```graphql
query {
  agents(limit: 10, offset: 0) {
    chainId
    agentId
    agentName
    agentAddress
    agentOwner
    description
    image
    a2aEndpoint
    ensEndpoint
    createdAtTime
  }
}
```

### Query Agents by Chain

```graphql
query {
  agentsByChain(chainId: 11155111, limit: 20) {
    agentId
    agentName
    agentAddress
    description
    a2aEndpoint
  }
}
```

### Query a Specific Agent

```graphql
query {
  agent(chainId: 11155111, agentId: "123") {
    chainId
    agentId
    agentName
    agentAddress
    agentOwner
    description
    image
    a2aEndpoint
    ensEndpoint
    metadataURI
    rawJson
  }
}
```

### Query Agents by Owner

```graphql
query {
  agentsByOwner(
    agentOwner: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"
    chainId: 11155111
    limit: 10
  ) {
    agentId
    agentName
    agentAddress
    createdAtTime
  }
}
```

### Search Agents

```graphql
query {
  searchAgents(
    query: "chat agent"
    chainId: 11155111
    limit: 10
  ) {
    agentId
    agentName
    description
    a2aEndpoint
  }
}
```

### Filtered Agents Query

```graphql
query {
  agents(
    chainId: 11155111
    agentName: "alice"
    limit: 20
    offset: 0
  ) {
    agentId
    agentName
    agentAddress
    description
  }
}
```

## Schema

```graphql
type Agent {
  chainId: Int!
  agentId: String!
  agentAddress: String!
  agentOwner: String!
  agentName: String!
  metadataURI: String
  createdAtBlock: Int!
  createdAtTime: Int!
  type: String
  description: String
  image: String
  a2aEndpoint: String
  ensEndpoint: String
  agentAccountEndpoint: String
  supportedTrust: String
  rawJson: String
  updatedAtTime: Int
}

type Query {
  # Get multiple agents with filters
  agents(
    chainId: Int
    agentId: String
    agentOwner: String
    agentName: String
    limit: Int
    offset: Int
  ): [Agent!]!
  
  # Get a specific agent by chainId and agentId
  agent(chainId: Int!, agentId: String!): Agent
  
  # Get agents for a specific chain
  agentsByChain(chainId: Int!, limit: Int, offset: Int): [Agent!]!
  
  # Get agents owned by a specific address
  agentsByOwner(
    agentOwner: String!
    chainId: Int
    limit: Int
    offset: Int
  ): [Agent!]!
  
  # Search agents by name, description, ID, or address
  searchAgents(
    query: String!
    chainId: Int
    limit: Int
    offset: Int
  ): [Agent!]!
}
```

## Chain IDs

- `11155111` - Ethereum Sepolia
- `84532` - Base Sepolia
- `11155420` - Optimism Sepolia

## Usage from Other Applications

### Using fetch (JavaScript/TypeScript)

```typescript
const query = `
  query {
    agentsByChain(chainId: 11155111, limit: 10) {
      agentId
      agentName
      agentAddress
      description
      a2aEndpoint
    }
  }
`;

const response = await fetch('http://localhost:4000/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

const data = await response.json();
console.log(data.data.agentsByChain);
```

### Using Apollo Client

```typescript
import { ApolloClient, InMemoryCache, gql } from '@apollo/client';

const client = new ApolloClient({
  uri: 'http://localhost:4000/graphql',
  cache: new InMemoryCache(),
});

const GET_AGENTS = gql`
  query GetAgents($chainId: Int!) {
    agentsByChain(chainId: $chainId, limit: 10) {
      agentId
      agentName
      agentAddress
      description
      a2aEndpoint
    }
  }
`;

const { data } = await client.query({
  query: GET_AGENTS,
  variables: { chainId: 11155111 },
});
```

### Using curl

```bash
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ agentsByChain(chainId: 11155111, limit: 5) { agentId agentName agentAddress } }"
  }'
```

## GraphiQL Playground

The GraphQL server includes GraphiQL, an interactive query browser. Simply navigate to:

```
http://localhost:4000/graphql
```

You can write and test queries directly in the browser, and see the schema documentation.

## Error Handling

The GraphQL API will return errors in the standard GraphQL error format:

```json
{
  "errors": [
    {
      "message": "Agent not found",
      "locations": [{"line": 2, "column": 5}],
      "path": ["agent"]
    }
  ],
  "data": {
    "agent": null
  }
}
```

## Pagination

Use `limit` and `offset` for pagination:

```graphql
# First page
query {
  agents(chainId: 11155111, limit: 20, offset: 0) {
    agentId
    agentName
  }
}

# Second page
query {
  agents(chainId: 11155111, limit: 20, offset: 20) {
    agentId
    agentName
  }
}
```

## Performance

- Default limit: 100 (max recommended: 1000)
- Queries are optimized with indexes on `chainId`, `agentId`, and `agentOwner`
- Use specific filters to improve query performance

