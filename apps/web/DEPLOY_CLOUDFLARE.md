# Cloudflare Pages Deployment Guide

## Quick Steps

Since your current Cloudflare Pages project is configured as "Direct Upload", you need to connect it to your GitHub repository to use the Next.js framework preset.

### Option 1: Connect Existing Project to Git (If Available)

1. Go to https://dash.cloudflare.com/
2. Navigate to **Workers & Pages** → **Pages**
3. Select your project `erc8004-web`
4. Look for **Settings** → **Source** or **Git connection**
5. Click **Connect to Git**
6. Select repository: `Agentic-Trust-Layer/agent-explorer`

If "Connect to Git" is not available, use Option 2.

### Option 2: Create New Project Connected to Git (Recommended)

1. **IMPORTANT**: First copy your current environment variables:
   - Go to https://dash.cloudflare.com/
   - Navigate to **Workers & Pages** → **Pages**
   - Select `erc8004-web`
   - Go to **Settings** → **Environment variables**
   - Take a screenshot or copy all values

2. **Delete the old project** (if you want a fresh start):
   - In the same settings page, scroll to bottom
   - Click **Delete project**

3. **Create new project**:
   - Click **Create a project**
   - Choose **Connect to Git**
   - Authorize Cloudflare to access GitHub
   - Select repository: `Agentic-Trust-Layer/agent-explorer`
   - Click **Begin setup**

4. **Configure build settings**:
   ```
   Framework preset: Next.js
   Root directory: apps/web
   Build command: cd ../.. && pnpm install && pnpm build:sdks && NODE_ENV=production pnpm --filter erc8004-web build
   Build output directory: .next
   Node.js version: 18
   ```

5. **Add environment variables**:
   - After initial setup, go to **Settings** → **Environment variables**
   - Add each variable (select **Production** environment):
   
   ```
   NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=BLPEpiCGGemncsyRbSt1NucfuR4IxWiGVPpuz0-8xNtoRtBn_d_XZxkcwm8c9V_FQUAj_1q9WuJNm7NYLnBORgE
   NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX=0xaa36a7
   NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/WvEny4nR70VTUMX0DfR-A
   NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
   NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER=0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
   NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY=0x8004a6090Cd10A7288092483047B097295Fb8847
   GRAPHQL_API_URL=https://erc8004-indexer-graphql.richardpedersen3.workers.dev/graphql
   ```

6. **Save and Deploy**:
   - Click **Save and deploy** or **Begin setup**
   - Cloudflare will automatically build and deploy

7. **Configure custom domain** (if using www.8004-agent.com):
   - After deployment succeeds, go to **Settings** → **Custom domains**
   - Add your custom domain
   - Update DNS if needed

## What This Fixes

✅ **Framework preset**: Uses Cloudflare's native Next.js support (bypasses @cloudflare/next-on-pages issues)
✅ **API routes**: Will work correctly with `export const dynamic = 'force-dynamic'`
✅ **Auto-deployment**: Every Git push triggers a new deployment
✅ **Proper build**: Next.js App Router builds correctly

## Testing After Deployment

Once deployed, test these URLs:

1. Homepage: https://www.8004-agent.com
2. API Agents: https://www.8004-agent.com/api/agents (should return JSON, not 500 error)
3. API Stats: https://www.8004-agent.com/api/stats

## Troubleshooting

**Build fails**:
- Check build logs for errors
- Verify Root directory is `apps/web`
- Ensure Node.js version is 18 or 20

**API routes still 500**:
- Verify Framework preset is **Next.js** (not "Other")
- Check browser console for runtime errors
- Ensure all environment variables are set

**Environment variables not working**:
- Make sure "Production" environment is selected
- Check for typos in variable names
- Redeploy after adding variables

## Need Help?

If you encounter issues, check the build logs in the Cloudflare Pages dashboard and share the error message.

