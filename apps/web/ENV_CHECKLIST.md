# Environment Variables Checklist for Cloudflare Pages

## ✅ Minimum Required - Copy and Paste These

Go to **Cloudflare Pages → Your Project → Settings → Environment variables** and add:

```
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID
NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX=0xaa36a7
NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL
NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY
NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER
NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY
NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL
GRAPHQL_API_URL
```

## 📝 Where to Get Values

### Standard Addresses (Sepolia)
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY`: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER`: `0x8FADE66B79cC9f707aB26799354482EB93a5B7dD`

### RPC URLs
- Get from Alchemy, Infura, or QuickNode
- Example: `https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY`

### Bundler URLs
- Pimlico Sepolia: `https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_KEY`
- Get API key from pimlico.io

### Web3Auth
- Sign up at web3auth.io to get client ID

### GraphQL
- Your deployed indexer GraphQL worker URL
- Or leave empty for now (empty data)

## 🔍 After Deployment

Check browser console for:
- ❌ `NEXT_PUBLIC_...` warnings → variable missing
- ❌ API errors → check GraphQL URL
- ⚠️ "ENS client not initialized" → check ENS variables

