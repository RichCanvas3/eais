# Cloudflare Pages Environment Variables

## Complete List of Required Environment Variables

Add ALL of these in Cloudflare Pages dashboard (**Settings** → **Environment variables**):

### 🔴 CRITICAL - Must Be Set

#### Web3Auth
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` - Your Web3Auth client ID

#### Ethereum Sepolia (L1) - Primary Chain
- `NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX` - `0xaa36a7`
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL` - Ethereum Sepolia RPC endpoint
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY` - ENS Registry contract address
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER` - ENS Resolver contract address
- `NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY` - Identity Registry contract address
- `NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL` - Pimlico bundler URL for Sepolia
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY` - Private key for ENS operations (🔒 keep secure!)
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_NAME` - Your ENS parent domain name (e.g., `8004-agent`)

#### Base Sepolia (L2) - Optional but Recommended
- `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` - Base Sepolia RPC endpoint
- `NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY` - Base Sepolia ENS Registry
- `NEXT_PUBLIC_BASE_SEPOLIA_ENS_RESOLVER` - Base Sepolia ENS Resolver
- `NEXT_PUBLIC_BASE_SEPOLIA_IDENTITY_REGISTRY` - Base Sepolia Identity Registry
- `NEXT_PUBLIC_BASE_SEPOLIA_BUNDLER_URL` - Base Sepolia bundler URL

#### Optimism Sepolia (L2) - Optional
- `NEXT_PUBLIC_OP_SEPOLIA_RPC_URL` - OP Sepolia RPC endpoint
- `NEXT_PUBLIC_OP_SEPOLIA_ENS_REGISTRY` - OP Sepolia ENS Registry
- `NEXT_PUBLIC_OP_SEPOLIA_ENS_RESOLVER` - OP Sepolia ENS Resolver
- `NEXT_PUBLIC_OP_SEPOLIA_IDENTITY_REGISTRY` - OP Sepolia Identity Registry
- `NEXT_PUBLIC_OP_SEPOLIA_BUNDLER_URL` - OP Sepolia bundler URL

### 🟡 IMPORTANT - For API Routes

#### GraphQL API
- `GRAPHQL_API_URL` or `NEXT_PUBLIC_GRAPHQL_API_URL` - URL to your GraphQL server
  - Example: `https://your-graphql-worker.workers.dev/graphql`
  - **Note**: If not set, API routes return empty data (site still loads)

### 🟢 OPTIONAL - Additional Features

#### Legacy/Alternate Names (used in some places)
- `NEXT_PUBLIC_RPC_URL` - Fallback RPC URL (eth_sepolia)
- `NEXT_PUBLIC_BUNDLER_URL` - Fallback bundler URL
- `NEXT_PUBLIC_ENS_REGISTRY` - Fallback ENS Registry
- `NEXT_PUBLIC_ENS_IDENTITY_WRAPPER` - ENS NameWrapper contract (default: `0x0635513f179D50A207757E05759CbD106d7dFcE8`)

#### Reputation & Trust
- `NEXT_PUBLIC_REPUTATION_REGISTRY` - Reputation registry contract address
- `NEXT_PUBLIC_PAYMASTER_URL` - Paymaster URL for sponsored transactions
- `NEXT_PUBLIC_ERC8004_TRUST_MODELS` - Trust models (e.g., `feedback`, comma-separated)

#### OpenAI (Optional)
- `OPENAI_API_KEY` - For AI-powered agent discovery
- `OPENAI_MODEL` - Model to use (defaults to `gpt-4o-mini`)

#### Identity Service
- `NEXT_PUBLIC_IDENTITY_API_URL` - Identity service API base URL
- `NEXT_PUBLIC_API_URL` - Generic API base URL

## ⚠️ IMPORTANT NOTES

1. **All `NEXT_PUBLIC_*` variables are exposed to the browser** - Don't put secrets there
2. **`NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY` is a security risk** - Consider using a service account instead
3. **Without GraphQL URL**, API routes will return empty data (site loads but no agent data)
4. **L2 chains are optional** - The site works with just Ethereum Sepolia

## How to Set in Cloudflare Pages

1. Go to Cloudflare Dashboard
2. Select your Pages project
3. Go to **Settings** → **Environment variables**
4. For each variable:
   - Click **Add variable**
   - Enter the variable name (exactly as listed above)
   - Enter the value
   - Select environment(s): Production, Preview, or Both
   - Click **Save**
5. Trigger a new deployment to apply changes

## Quick Test

After setting variables, check:
1. Site loads without errors
2. Visit `/api/stats` - should return data or empty JSON (not 500 error)
3. Try logging in - Web3Auth should work
4. Check browser console for warnings about missing variables

