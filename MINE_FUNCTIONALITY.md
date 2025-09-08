# Mine Agents Functionality

This document describes the new "Mine Agents" functionality that allows users to find all agent identity IDs and associated AA (Account Abstraction) addresses that are owned by a specific EOA (Externally Owned Account) address.

## Overview

The mine functionality uses the same ownership computation logic that is used in the main agent table's "Mine" filter. It derives smart account addresses from an EOA address and domain salt to determine which agents are owned by that EOA.

## How It Works

1. **Ownership Computation**: For each agent in the database, the system:
   - Takes the agent's domain and creates a salt using `keccak256(stringToHex(domain.toLowerCase()))`
   - Uses the MetaMask delegation toolkit to derive a smart account address from the EOA and salt
   - Compares the derived address with the agent's stored address
   - If they match, the agent is considered "owned" by that EOA

2. **ENS Integration**: The system also resolves ENS names for agent addresses using the `@ensdomains/ensjs` library for better user experience.

## API Endpoint

### GET `/api/agents/mine`

**Parameters:**
- `owner` (required): The EOA address to check ownership for

**Example:**
```
GET /api/agents/mine?owner=0x1234567890123456789012345678901234567890
```

**Response:**
```json
{
  "owner": "0x1234567890123456789012345678901234567890",
  "totalOwned": 2,
  "agents": [
    {
      "agentId": "1",
      "agentAddress": "0xabcdef...",
      "agentDomain": "example.eth",
      "metadataURI": null,
      "createdAtBlock": 12345,
      "createdAtTime": 1640995200,
      "derivedAddress": "0xabcdef..."
    }
  ],
  "computedAt": "2024-01-01T00:00:00.000Z"
}
```

## Web Interface

### Access
Navigate to `/mine` in the web application or click the "Mine Agents" button on the main page.

### Features
- **Auto-fill**: If connected to a wallet, the owner address is automatically filled
- **ENS Resolution**: Shows ENS names for agent addresses when available
- **Copy to Clipboard**: Easy copying of agent addresses
- **Etherscan Links**: Direct links to view agents on Etherscan
- **Responsive Design**: Works on desktop and mobile devices

### Usage
1. Enter an EOA address (or connect your wallet for auto-fill)
2. Click "Find Mine" to search for owned agents
3. View results in a table with agent details
4. Use action buttons to copy addresses or view on Etherscan

## Technical Details

### Dependencies
- `@metamask/delegation-toolkit`: For smart account address derivation
- `@ensdomains/ensjs`: For ENS name resolution
- `viem`: For blockchain interactions
- `better-sqlite3`: For database queries

### Error Handling
- Invalid address format validation
- Network error handling for blockchain calls
- Graceful fallback for ENS resolution failures
- Comprehensive error messages for users

### Performance Considerations
- Ownership computation is done server-side to avoid client-side blockchain calls
- ENS resolution is done in parallel for better performance
- Results are cached in the response for immediate display

## Security Notes

- The API validates address format before processing
- Ownership computation uses the same secure derivation method as the main application
- No private keys or sensitive data are exposed in the API
- All blockchain interactions use read-only operations

## Future Enhancements

Potential improvements could include:
- Caching of ownership computations
- Batch processing for multiple addresses
- Historical ownership tracking
- Integration with other identity systems
