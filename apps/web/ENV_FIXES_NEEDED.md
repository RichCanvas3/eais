# Environment Variable Issues Found

## 🔴 CRITICAL: Missing Required Variable

### `GRAPHQL_API_URL`
**Status**: ❌ NOT SET  
**Impact**: API routes (`/api/agents`, `/api/stats`, `/api/agents/[agentId]`) will return empty data  
**Action**: Set this to your GraphQL server URL
- Example: `https://your-graphql-worker.workers.dev/graphql`
- Or: `http://localhost:4000/graphql` (for testing)

## 🟡 ISSUES: Incorrect OP Sepolia Values

### 1. `NEXT_PUBLIC_OP_SEPOLIA_RPC_URL`
**Current**: `https://opt-mainnet.g.alchemy.com/v2/...`  
**Problem**: Using mainnet URL instead of Sepolia  
**Should be**: `https://opt-sepolia.g.alchemy.com/v2/...`

### 2. `NEXT_PUBLIC_OP_SEPOLIA_ENS_RESOLVER`
**Current**: `0x8FADE66BF79Cd7F7d2b6b8C3C2C3C2C3C2C3C2C3`  
**Problem**: Invalid address (looks corrupted/repeating pattern)  
**Should be**: Check your OP Sepolia resolver contract address (likely different from ETH Sepolia)

### 3. `NEXT_PUBLIC_OP_SEPOLIA_IDENTITY_REGISTRY`
**Current**: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`  
**Problem**: This is the ENS Registry address, not an Identity Registry  
**Should be**: Your actual OP Sepolia Identity Registry contract address

## ✅ Correctly Set Variables

All ETH Sepolia variables look correct:
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL`
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY`
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER`
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY`
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL`
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX`
- ✅ `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`

Base Sepolia variables also look correct.

## 📋 Action Items

1. **Set `GRAPHQL_API_URL`** - Required for site to show agent data
2. **Fix OP Sepolia RPC URL** - Change `opt-mainnet` to `opt-sepolia`
3. **Fix OP Sepolia Resolver** - Get correct resolver address
4. **Fix OP Sepolia Identity Registry** - Get correct registry address

## Optional: OpenAI API Key

If you want the discover feature to work:
- `OPENAI_API_KEY` (optional)

## Testing After Fixes

1. Deploy with updated variables
2. Check browser console for errors
3. Visit `/api/stats` - should return data (not empty)
4. Try logging in - should work
5. Check agent table - should load agents if GraphQL is working

