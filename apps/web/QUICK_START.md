# Quick Start Deployment to Cloudflare Pages

## Step 1: Build Locally (Test First)

```bash
# From project root
pnpm install
pnpm build:sdks
NODE_ENV=production pnpm --filter erc8004-web build
```

## Step 2: Check Build Size

```bash
cd apps/web
du -sh .next
```

Should be under 100MB. If larger, run cleanup:
```bash
./deploy-to-cloudflare.sh
```

## Step 3: Deploy to Cloudflare

### Option A: Cloudflare Dashboard (Recommended)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages
2. Create project from Git
3. **Configure**:
   - Root dir: `apps/web`
   - Build cmd: `cd ../.. && pnpm install && pnpm build:sdks && NODE_ENV=production pnpm --filter erc8004-web build`
   - Output dir: `.next`
4. **Set Environment Variables** (see below)
5. Deploy

### Option B: Wrangler CLI

```bash
cd apps/web
./deploy-to-cloudflare.sh
```

## Step 4: Set Environment Variables

**In Cloudflare Pages Dashboard → Settings → Environment Variables, add:**

### Minimum Required (Site Will Load)
```
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=BLPEpiCGGemncsyRbSt1NucfuR4IxWiGVPpuz0-8xNtoRtBn_d_XZxkcwm8c9V_FQUAj_1q9WuJNm7NYLnBORgE
NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX=0xaa36a7
NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER=0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY=0x8004a6090Cd10A7288092483047B097295Fb8847
NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL=https://api.pimlico.io/v2/11155111/rpc?apikey=YOUR_KEY
GRAPHQL_API_URL=https://your-graphql-worker.workers.dev/graphql
```

### Optional (For Full Features)
```
NEXT_PUBLIC_ETH_SEPOLIA_ENS_NAME=8004-agent
NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY=0x...
NEXT_PUBLIC_BASE_SEPOLIA_BUNDLER_URL=...
NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY=...
NEXT_PUBLIC_BASE_SEPOLIA_ENS_RESOLVER=...
NEXT_PUBLIC_BASE_SEPOLIA_IDENTITY_REGISTRY=...
NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL=...
OPENAI_API_KEY=sk-...
```

**Replace `YOUR_KEY` values with your actual keys!**

## Step 5: Test Deployment

1. Visit your deployed URL
2. Check browser console for errors
3. Try logging in
4. Check if agent table loads

## Common Problems

| Problem | Solution |
|---------|----------|
| "Site won't load" | Check all required env vars are set |
| "No agent data" | Set `GRAPHQL_API_URL` |
| "Can't login" | Check `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` |
| "Build fails" | Check build logs, verify SDKs built |
| "Files over 25MB" | Run `./deploy-to-cloudflare.sh` script |

## Getting Your RPC URLs

- **Alchemy**: https://www.alchemy.com/ → Create app → Copy Sepolia RPC URL
- **Infura**: https://infura.io/ → Create project → Copy Sepolia URL
- **QuickNode**: https://www.quicknode.com/ → Create endpoint

## Getting Bundler URLs

- **Pimlico**: https://pimlico.io/ → Sign up → Get API key → Use URL format above

## Getting GraphQL URL

- Your deployed Cloudflare Worker with GraphQL endpoint
- Format: `https://your-worker-name.workers.dev/graphql`

## Success Checklist

- ✅ Site loads without errors
- ✅ Can log in with Web3Auth
- ✅ Agent table displays (if GraphQL configured)
- ✅ No console errors about missing env vars
- ✅ Build completes under 25MB limit

## Need More Help?

See:
- `FINAL_DEPLOYMENT_GUIDE.md` - Complete deployment guide
- `ENV_CHECKLIST.md` - All environment variables
- `CLOUDFLARE_TROUBLESHOOTING.md` - Troubleshooting guide

