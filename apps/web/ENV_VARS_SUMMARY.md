# Environment Variables for Cloudflare Pages Deployment

## 🔴 CRITICAL - Must Set These

### Web3Auth
```
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=your_web3auth_client_id
```

### Ethereum Sepolia (L1)
```
NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX=0xaa36a7
NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER=0x8FADE66B79cC9f707aB26799354482EB93a5B7dD
NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY=0x8004a6090Cd10A7288092483047B097295Fb8847
NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL=https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_KEY
NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY=0x...
NEXT_PUBLIC_ETH_SEPOLIA_ENS_NAME=8004-agent
```

### GraphQL API (for agent data)
```
GRAPHQL_API_URL=https://your-graphql-worker.workers.dev/graphql
```

## 🟡 OPTIONAL - Add for Full Features

### Base Sepolia (L2)
```
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY=...
NEXT_PUBLIC_BASE_SEPOLIA_ENS_RESOLVER=...
NEXT_PUBLIC_BASE_SEPOLIA_IDENTITY_REGISTRY=...
NEXT_PUBLIC_BASE_SEPOLIA_BUNDLER_URL=https://api.pimlico.io/v2/84532/rpc?apikey=YOUR_KEY
```

### OpenAI (for discover feature)
```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### Legacy/Fallback Names
```
NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_BUNDLER_URL=https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_KEY
NEXT_PUBLIC_ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
NEXT_PUBLIC_ENS_IDENTITY_WRAPPER=0x0635513f179D50A207757E05759CbD106d7dFcE8
NEXT_PUBLIC_REPUTATION_REGISTRY=...
NEXT_PUBLIC_PAYMASTER_URL=...
NEXT_PUBLIC_ERC8004_TRUST_MODELS=feedback
```

## 📝 How to Set in Cloudflare Pages

1. Go to Cloudflare Dashboard → Your Pages Project → Settings → Environment variables
2. Click "Add variable" for each one above
3. Enter the exact variable name (case-sensitive!)
4. Enter the value
5. Select environment: Production, Preview, or Both
6. Click Save
7. Trigger a new deployment

## ⚠️ Security Notes

- All `NEXT_PUBLIC_*` variables are exposed to browser (visible in client-side code)
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY` is a private key - use a restricted account!
- Consider using Cloudflare Workers secrets for sensitive keys

## ✅ Minimum Required

**At minimum, set these to get the site running:**
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID`
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER`
- `NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY`
- `NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL`
- `GRAPHQL_API_URL` (or API routes return empty data)

Without the ETH Sepolia variables, the app will crash on startup.

