# Cloudflare Pages Deployment Guide

This guide explains how to deploy the ERC-8004 Web application to Cloudflare Pages.

## Prerequisites

1. A Cloudflare account
2. Your repository pushed to GitHub, GitLab, or Bitbucket
3. All environment variables ready (see below)

## Deployment Steps

### Option 1: Deploy via Cloudflare Pages Dashboard (Recommended)

1. **Go to Cloudflare Dashboard**
   - Navigate to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Select **Pages** from the sidebar
   - Click **Create a project**

2. **Connect Your Repository**
   - Choose **Connect to Git**
   - Authorize Cloudflare to access your Git provider
   - Select the repository: `erc-8004-identity-indexer`

3. **Configure Build Settings**
   - **Project name**: `erc8004-web`
   - **Framework preset**: `Next.js` (Cloudflare will auto-detect)
   - **Root directory**: `/apps/web`
   - **Build command**: 
     ```bash
     cd ../.. && pnpm install && pnpm build:sdks && NODE_ENV=production pnpm --filter erc8004-web build && rm -rf apps/web/.next/cache apps/web/.next/trace && find apps/web/.next -name "*.map" -type f -delete && find apps/web/.next -name "*.pack.gz" -type f -delete
     ```
   - **Build output directory**: `.next`
   - **Node.js version**: `18` or `20`

4. **Set Environment Variables**
   - Go to **Settings** → **Environment variables**
   - Add all required variables listed below
   - Set them for both **Production** and **Preview** environments

5. **Deploy**
   - Click **Save and Deploy**
   - Wait for the build to complete
   - Your site will be available at `https://erc8004-web.pages.dev`

### Option 2: Deploy via Wrangler CLI

1. **Install Wrangler**
   ```bash
   npm install -g wrangler
   # or
   pnpm add -g wrangler
   ```

2. **Login to Cloudflare**
   ```bash
   wrangler login
   ```

3. **Build the Project**
   ```bash
   # From project root
   pnpm install
   pnpm build:sdks
   NODE_ENV=production pnpm --filter erc8004-web build
   ```

4. **Clean and Build**
   ```bash
   cd apps/web
   # Remove cache before building
   rm -rf .next/cache .next/trace
   # Build the project (production mode)
   cd ../..
   pnpm build:sdks
   NODE_ENV=production pnpm --filter erc8004-web build
   ```

5. **Deploy to Cloudflare Pages**
   ```bash
   cd apps/web
   # Ensure cache is removed before deployment
   rm -rf .next/cache .next/trace
   wrangler pages deploy .next --project-name=erc8004-web
   ```

## Required Environment Variables

Add these in Cloudflare Pages dashboard (**Settings** → **Environment variables**):

### Web3Auth
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` - Your Web3Auth client ID

### Ethereum Sepolia (L1)
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL` - RPC endpoint URL
- `NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX` - `0xaa36a7`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY` - ENS Registry contract address
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER` - ENS Resolver contract address
- `NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY` - Identity Registry contract address
- `NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL` - Pimlico bundler URL
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY` - Private key for ENS operations (keep secure!)

### Base Sepolia (L2) - Optional
- `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY`
- `NEXT_PUBLIC_BASE_SEPOLIA_ENS_RESOLVER`
- `NEXT_PUBLIC_BASE_SEPOLIA_IDENTITY_REGISTRY`
- `NEXT_PUBLIC_BASE_SEPOLIA_BUNDLER_URL`

### Optimism Sepolia (L2) - Optional
- `NEXT_PUBLIC_OP_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_OP_SEPOLIA_ENS_REGISTRY`
- `NEXT_PUBLIC_OP_SEPOLIA_ENS_RESOLVER`
- `NEXT_PUBLIC_OP_SEPOLIA_IDENTITY_REGISTRY`
- `NEXT_PUBLIC_OP_SEPOLIA_BUNDLER_URL`

### Database Configuration (REQUIRED for API routes)
- `USE_D1` - Set to `"true"` to use Cloudflare D1 (REQUIRED)
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID
- `CLOUDFLARE_D1_DATABASE_ID` - Your D1 database ID
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token with D1 access

**⚠️ CRITICAL**: Without these D1 variables, API routes will fail because they can't access the database.

### GraphQL API (REQUIRED for API routes)
- `GRAPHQL_API_URL` or `NEXT_PUBLIC_GRAPHQL_API_URL` - URL to your GraphQL server
  - Example: `https://your-graphql-worker.workers.dev/graphql`
  - Or: `http://localhost:4000/graphql` (for local development)
  - **Note**: If not set, API routes will return empty data (site will still load)

### OpenAI (Optional - for discover/graph features)
- `OPENAI_API_KEY` - For AI-powered agent discovery
- `OPENAI_MODEL` - Model to use (defaults to 'gpt-4o-mini')

## Custom Domain Setup

After deployment:

1. Go to your Pages project → **Custom domains**
2. Click **Set up a custom domain**
3. Enter your domain name
4. Add the DNS records as instructed by Cloudflare
5. Cloudflare will automatically provision SSL certificates

## Build Process

The build process:
1. Installs all dependencies (including workspace dependencies)
2. Builds both SDKs (`@erc8004/sdk` and `@erc8004/agentic-trust-sdk`)
3. Builds the Next.js web application

## Troubleshooting

### Build Fails
- Ensure all environment variables are set
- Check that Node.js version is 18 or 20
- Verify the root directory is correctly set to `/apps/web`

### Runtime Errors
- Verify all `NEXT_PUBLIC_*` environment variables are configured
- Check browser console for missing configuration
- Ensure RPC URLs are accessible

### SDK Build Errors
- Make sure `pnpm build:sdks` completes successfully
- Check that workspace dependencies are properly linked

## Notes

- Cloudflare Pages has native Next.js support (no adapter needed)
- The build runs from the monorepo root to ensure workspace dependencies are available
- Environment variables with `NEXT_PUBLIC_` prefix are exposed to the browser
- Keep sensitive keys like `NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY` secure
- Consider using Cloudflare's environment variable encryption for sensitive values

