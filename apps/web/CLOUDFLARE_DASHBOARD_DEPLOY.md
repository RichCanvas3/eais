# Cloudflare Dashboard Deployment - Step by Step

## Quick Deploy Checklist

### Step 1: Access Cloudflare Dashboard
1. Go to https://dash.cloudflare.com/
2. Navigate to **Pages** → Your project (`erc8004-web`)
3. If you don't have a project yet, click **Create a project** → **Connect to Git**

### Step 2: Configure Build Settings
1. Go to **Settings** → **Builds & deployments**
2. Click **Edit configuration**
3. Set the following:

   **Framework preset**: `Next.js`
   
   **Root directory**: `apps/web`
   
   **Build command**:
   ```
   cd ../.. && pnpm install && pnpm build:sdks && NODE_ENV=production pnpm --filter erc8004-web build
   ```
   
   **Build output directory**: `.next`
   
   **Node.js version**: `18` or `20`

4. Click **Save**

### Step 3: Set Environment Variables
1. Go to **Settings** → **Environment variables**
2. Click **Add variable** for each:

#### Production Environment Variables:

```
NEXT_PUBLIC_WEB3AUTH_CLIENT_ID=BLPEpiCGGemncsyRbSt1NucfuR4IxWiGVPpuz0-8xNtoRtBn_d_XZxkcwm8c9V_FQUAj_1q9WuJNm7NYLnBORgE
```

```
NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX=0xaa36a7
```

```
NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/WvEny4nR70VTUMX0DfR-A
```

```
NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY=0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e
```

```
NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER=0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5
```

```
NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY=0x8004a6090Cd10A7288092483047B097295Fb8847
```

```
GRAPHQL_API_URL=https://erc8004-indexer-graphql.richardpedersen3.workers.dev/graphql
```

**Note**: `GRAPHQL_API_URL` is already hardcoded as a fallback, but setting it explicitly is cleaner.

3. Make sure to select **Production** environment for each variable
4. Click **Save**

### Step 4: Trigger Deployment
1. Go to **Deployments** tab
2. If Git is connected:
   - Push a commit to trigger auto-deploy, OR
   - Click **Retry deployment** on the latest deployment
3. If deploying manually:
   - Go to **Settings** → **Builds & deployments**
   - You may need to connect Git first

### Step 5: Monitor Build
1. Watch the build logs in real-time
2. Wait for build to complete (usually 2-5 minutes)
3. Check for any build errors

### Step 6: Test Deployment
1. Visit your site URL: https://www.8004-agent.com
2. Open browser DevTools (F12) → Network tab
3. Test the API:
   - Visit: `https://www.8004-agent.com/api/agents`
   - Should return JSON with agent data (not 500 error)
4. Test the homepage:
   - Should load without errors
   - Agent table should display if API works

### Step 7: Verify API Routes Work
Test these endpoints:
- ✅ `https://www.8004-agent.com/api/agents` - Should return JSON
- ✅ `https://www.8004-agent.com/api/stats` - Should return JSON
- ✅ `https://www.8004-agent.com/api/agents/74` - Should return single agent

All should return 200 OK (not 500).

## Troubleshooting

### Build Fails
- Check build logs for errors
- Verify Node.js version is 18 or 20
- Ensure all dependencies are in `package.json`

### API Routes Still Return 500
- Verify Framework preset is **Next.js** (not "Other")
- Check that `GRAPHQL_API_URL` is set correctly
- Check browser console for errors

### Site Won't Load
- Check all environment variables are set
- Verify Root directory is `apps/web` (not just `web`)

## Success Indicators

✅ Build completes without errors  
✅ Site loads at https://www.8004-agent.com  
✅ `/api/agents` returns JSON (status 200)  
✅ Agent table displays on homepage  
✅ No console errors in browser

## Next Steps After Success

Once API routes are working:
1. Test full user flow (login, agent discovery, etc.)
2. Monitor Cloudflare Analytics for errors
3. Set up Preview deployments for PR testing

