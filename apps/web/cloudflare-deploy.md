# Cloudflare Pages Deployment Guide

This guide explains how to deploy the ERC-8004 Web application to Cloudflare Pages.

## Prerequisites

1. A Cloudflare account
2. Wrangler CLI installed: `npm install -g wrangler` or `pnpm add -g wrangler`
3. Access to Cloudflare dashboard

## Option 1: Deploy via Cloudflare Pages Dashboard

### Step 1: Connect Repository

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Navigate to **Pages** → **Create a project**
3. Connect your Git repository (GitHub, GitLab, or Bitbucket)
4. Select the repository containing this project

### Step 2: Configure Build Settings

- **Project name**: `erc8004-web`
- **Framework preset**: `Next.js`
- **Root directory**: `/apps/web`
- **Build command**: `cd ../.. && pnpm install && pnpm build:sdks && pnpm --filter erc8004-web build`
- **Build output directory**: `.next`
- **Node.js version**: `18` or `20`

### Step 3: Set Environment Variables

In the Cloudflare Pages dashboard, go to **Settings** → **Environment variables** and add all required environment variables (see below).

## Option 2: Deploy via Wrangler CLI

### Step 1: Install Dependencies

```bash
pnpm install -g wrangler
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

### Step 3: Build the Project

```bash
# From project root
pnpm build:sdks
pnpm --filter erc8004-web build
```

### Step 4: Deploy

```bash
cd apps/web
wrangler pages deploy .next --project-name=erc8004-web
```

## Required Environment Variables

Configure these in Cloudflare Pages dashboard (Settings → Environment variables):

### Web3Auth Configuration
- `NEXT_PUBLIC_WEB3AUTH_CLIENT_ID` - Your Web3Auth client ID

### Ethereum Sepolia (L1)
- `NEXT_PUBLIC_ETH_SEPOLIA_RPC_URL` - Ethereum Sepolia RPC endpoint
- `NEXT_PUBLIC_ETH_SEPOLIA_CHAIN_ID_HEX` - `0xaa36a7`
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_REGISTRY` - ENS Registry address
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_RESOLVER` - ENS Resolver address
- `NEXT_PUBLIC_ETH_SEPOLIA_IDENTITY_REGISTRY` - Identity Registry address
- `NEXT_PUBLIC_ETH_SEPOLIA_BUNDLER_URL` - Pimlico bundler URL
- `NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY` - Private key for ENS operations

### Base Sepolia (L2)
- `NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL` - Base Sepolia RPC endpoint
- `NEXT_PUBLIC_BASE_SEPOLIA_ENS_REGISTRY` - Base Sepolia ENS Registry
- `NEXT_PUBLIC_BASE_SEPOLIA_ENS_RESOLVER` - Base Sepolia ENS Resolver
- `NEXT_PUBLIC_BASE_SEPOLIA_IDENTITY_REGISTRY` - Base Sepolia Identity Registry
- `NEXT_PUBLIC_BASE_SEPOLIA_BUNDLER_URL` - Base Sepolia Bundler URL

### Optimism Sepolia (L2) - Optional
- `NEXT_PUBLIC_OP_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_OP_SEPOLIA_ENS_REGISTRY`
- `NEXT_PUBLIC_OP_SEPOLIA_ENS_RESOLVER`
- `NEXT_PUBLIC_OP_SEPOLIA_IDENTITY_REGISTRY`
- `NEXT_PUBLIC_OP_SEPOLIA_BUNDLER_URL`

## Custom Domain

After deployment:

1. Go to your Pages project → **Custom domains**
2. Add your domain
3. Update DNS records as instructed by Cloudflare

## Notes

- The build process compiles both SDKs (`erc8004-src` and `erc8004-agentic-trust-sdk`) before building the web app
- Environment variables prefixed with `NEXT_PUBLIC_` are exposed to the browser
- Make sure sensitive keys (like `NEXT_PUBLIC_ETH_SEPOLIA_ENS_PRIVATE_KEY`) are properly secured
- The application uses Next.js App Router which is fully supported by Cloudflare Pages

