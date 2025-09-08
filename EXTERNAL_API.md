# External API Documentation

This document describes the external API endpoints that allow third-party applications to query agent identity data.

## Base URL

```
https://your-domain.com/api/agents
```

## Authentication

Currently, no authentication is required. All endpoints are publicly accessible.

## CORS Support

All endpoints support CORS and can be called from web applications running in browsers.

## Endpoints

### 1. Get Agents by Owner EOA Address

**Endpoint:** `GET /api/agents/by-owner`

**Description:** Returns all agent identity IDs and associated AA addresses that are owned by a specific EOA address using the "mine" logic.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `owner` | string | Yes | The EOA address to check ownership for (0x format) |
| `includeEns` | boolean | No | Whether to include ENS names for agent addresses (default: false) |
| `format` | string | No | Response format: "json" (default) or "csv" |

**Example Requests:**

```bash
# Basic request
GET /api/agents/by-owner?owner=0x1234567890123456789012345678901234567890

# With ENS names
GET /api/agents/by-owner?owner=0x1234567890123456789012345678901234567890&includeEns=true

# CSV format
GET /api/agents/by-owner?owner=0x1234567890123456789012345678901234567890&format=csv
```

**Response Format (JSON):**

```json
{
  "success": true,
  "owner": "0x1234567890123456789012345678901234567890",
  "totalOwned": 2,
  "agents": [
    {
      "agentId": "1",
      "agentAddress": "0xabcdef1234567890123456789012345678901234",
      "agentDomain": "example.eth",
      "metadataURI": null,
      "createdAtBlock": 12345,
      "createdAtTime": 1640995200,
      "derivedAddress": "0xabcdef1234567890123456789012345678901234",
      "ensName": "example.eth"
    }
  ],
  "computedAt": "2024-01-01T12:00:00.000Z",
  "chain": {
    "id": 11155111,
    "name": "Sepolia"
  }
}
```

**Response Format (CSV):**

```csv
agentId,agentAddress,agentDomain,metadataURI,createdAtBlock,createdAtTime,derivedAddress,ensName
1,"0xabcdef1234567890123456789012345678901234","example.eth","",12345,1640995200,"0xabcdef1234567890123456789012345678901234","example.eth"
```

**Error Responses:**

```json
{
  "error": "Owner address is required",
  "code": "MISSING_OWNER"
}
```

```json
{
  "error": "Invalid address format",
  "code": "INVALID_ADDRESS"
}
```

```json
{
  "error": "Failed to compute ownership",
  "code": "OWNERSHIP_COMPUTATION_ERROR"
}
```

### 2. Search Agents (Existing Endpoint)

**Endpoint:** `GET /api/agents`

**Description:** Search and filter agents by various criteria.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `q` | string | No | General search query |
| `domain` | string | No | Filter by domain |
| `address` | string | No | Filter by agent address |
| `agentId` | string | No | Filter by agent ID |
| `page` | number | No | Page number (default: 1) |
| `pageSize` | number | No | Items per page (default: 20, max: 100) |

**Example Request:**

```bash
GET /api/agents?domain=example&page=1&pageSize=10
```

**Response:**

```json
{
  "page": 1,
  "pageSize": 10,
  "total": 25,
  "rows": [
    {
      "agentId": "1",
      "agentAddress": "0xabcdef1234567890123456789012345678901234",
      "owner": "0x1234567890123456789012345678901234567890",
      "agentDomain": "example.eth",
      "metadataURI": null,
      "createdAtBlock": 12345,
      "createdAtTime": 1640995200
    }
  ]
}
```

## Usage Examples

### JavaScript/TypeScript

```javascript
// Get agents owned by an EOA address
async function getOwnedAgents(ownerAddress) {
  try {
    const response = await fetch(
      `/api/agents/by-owner?owner=${ownerAddress}&includeEns=true`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.agents;
  } catch (error) {
    console.error('Error fetching owned agents:', error);
    throw error;
  }
}

// Usage
const ownerAddress = "0x1234567890123456789012345678901234567890";
getOwnedAgents(ownerAddress)
  .then(agents => {
    console.log(`Found ${agents.length} owned agents:`, agents);
  })
  .catch(error => {
    console.error('Failed to fetch agents:', error);
  });
```

### Python

```python
import requests
import json

def get_owned_agents(owner_address, include_ens=False):
    """Get agents owned by an EOA address"""
    url = f"/api/agents/by-owner"
    params = {
        "owner": owner_address,
        "includeEns": str(include_ens).lower()
    }
    
    try:
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching owned agents: {e}")
        raise

# Usage
owner_address = "0x1234567890123456789012345678901234567890"
result = get_owned_agents(owner_address, include_ens=True)
print(f"Found {result['totalOwned']} owned agents")
for agent in result['agents']:
    print(f"Agent {agent['agentId']}: {agent['agentDomain']} -> {agent['agentAddress']}")
```

### cURL

```bash
# Get agents owned by an address
curl "https://your-domain.com/api/agents/by-owner?owner=0x1234567890123456789012345678901234567890&includeEns=true"

# Get CSV format
curl "https://your-domain.com/api/agents/by-owner?owner=0x1234567890123456789012345678901234567890&format=csv" \
  -H "Accept: text/csv" \
  -o agents.csv
```

## Rate Limiting

Currently, no rate limiting is implemented. Please use the API responsibly and consider implementing client-side rate limiting for production applications.

## Error Codes

| Code | Description |
|------|-------------|
| `MISSING_OWNER` | Owner address parameter is missing |
| `INVALID_ADDRESS` | Invalid Ethereum address format |
| `OWNERSHIP_COMPUTATION_ERROR` | Error during ownership computation |
| `INTERNAL_ERROR` | Internal server error |

## Data Fields

### Agent Object

| Field | Type | Description |
|-------|------|-------------|
| `agentId` | string | Unique agent identifier |
| `agentAddress` | string | The AA (Account Abstraction) address |
| `agentDomain` | string | The ENS domain associated with the agent |
| `metadataURI` | string\|null | URI to agent metadata (if available) |
| `createdAtBlock` | number | Block number when agent was created |
| `createdAtTime` | number | Unix timestamp when agent was created |
| `derivedAddress` | string | The derived address from ownership computation |
| `ensName` | string\|null | ENS name for the agent address (if includeEns=true) |

## Ownership Logic

The ownership computation uses the following logic:

1. For each agent, the system generates a salt using `keccak256(stringToHex(domain.toLowerCase()))`
2. Uses MetaMask delegation toolkit to derive a smart account address from the EOA and salt
3. Compares the derived address with the agent's stored address
4. If they match, the agent is considered "owned" by that EOA

This is the same logic used in the web application's "Mine" filter.

## Support

For questions or issues with the API, please refer to the main project documentation or create an issue in the project repository.
