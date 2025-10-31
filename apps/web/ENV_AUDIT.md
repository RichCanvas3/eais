# Environment Variables Audit

## ✅ Correctly Set (No Action Needed)

### Web3Auth
- ✅ `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` - Set correctly

### Ethereum Sepolia (L1)
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX` - `0xaa36a7` ✓
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL` - Correct Alchemy URL ✓
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY` - Standard ENS Registry ✓
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER` - Resolver address ✓
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY` - Identity Registry ✓
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL` - Pimlico Sepolia ✓
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY` - Set ✓
- ✅ `NEXT_PUBLIC_ETH_SEPOLIA_ENS_NAME` - `8004-agent` ✓

### Base Sepolia (L2)
- ✅ All Base Sepolia variables are correctly set

## 🔴 CRITICAL: Missing Variable

### `GRAPHQL_API_URL`
**Status**: ❌ NOT SET  
**Impact**: 
- Site will load but show no agent data
- `/api/agents`, `/api/stats`, `/api/agents/[agentId]` return empty results
- Agent table will be empty

**Action**: Add this variable:
```
GRAPHQL_API_URL=https://your-graphql-worker.workers.dev/graphql
```

**Where to get**: Your deployed Cloudflare Worker GraphQL server URL

## 🟡 ISSUES: OP Sepolia Variables

### 1. `NEXT_PUBLIC_OP_SEPOLIA_RPC_URL`
**Current**: `https://opt-mainnet.g.alchemy.com/v2/...`  
**Problem**: Using **mainnet** URL, should be **Sepolia**  
**Fix**: Change to:
```
NEXT_PUBLIC_OP_SEPOLIA_RPC_URL=https://opt-sepolia.g.alchemy.com/v2/WvEny4nR70VTUMX0DfR-A
```

### 2. `NEXT_PUBLIC_OP_SEPOLIA_ENS_RESOLVER`
**Current**: `0x8FADE66BF79Cd7F7d2b6b8C3C2C3C2C3C2C3C2C3`  
**Problem**: Invalid address (corrupted/repeating pattern)  
**Fix**: Get the correct OP Sepolia resolver address. This might be different from ETH Sepolia.

### 3. `NEXT_PUBLIC_OP_SEPOLIA_IDENTITY_REGISTRY`
**Current**: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`  
**Problem**: This is the ENS Registry address, not your Identity Registry  
**Fix**: Replace with your actual OP Sepolia Identity Registry contract address (should be different from ETH Sepolia)

### 4. `NEXT_PUBLIC_OP_SEPOLIA_BUNDLER_URL`
**Current**: Using Base Sepolia bundler (`84532`)  
**Problem**: OP Sepolia chain ID is `11155420`, not `84532`  
**Fix**: Change to:
```
NEXT_PUBLIC_OP_SEPOLIA_BUNDLER_URL=https://api.pimlico.io/v2/11155420/rpc?apikey=pim_WXQDyiHW9VidMd66HJkbLT
```

## 📋 Summary

### Must Fix (Site won't work without these)
1. **Set `GRAPHQL_API_URL`** - Required for agent data

### Should Fix (OP Sepolia won't work correctly)
1. Fix `NEXT_PUBLIC_OP_SEPOLIA_RPC_URL` - Change mainnet → sepolia
2. Fix `NEXT_PUBLIC_OP_SEPOLIA_BUNDLER_URL` - Change chain ID from 84532 to 11155420
3. Fix `NEXT_PUBLIC_OP_SEPOLIA_ENS_RESOLVER` - Get correct address
4. Fix `NEXT_PUBLIC_OP_SEPOLIA_IDENTITY_REGISTRY` - Get correct registry address

## 🚀 Quick Fix Priority

1. **HIGH**: Set `GRAPHQL_API_URL` (site works but shows empty data without it)
2. **MEDIUM**: Fix OP Sepolia RPC URL (prevents OP Sepolia features)
3. **LOW**: Fix other OP Sepolia variables (only affects OP Sepolia chain)

## Testing

After fixing `GRAPHQL_API_URL`:
1. Visit your deployed site
2. Check browser console - should see no errors about missing GraphQL
3. Visit `/api/stats` - should return agent statistics (not empty `{}`)
4. Login and check agent table - should show agents

