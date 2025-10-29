# Publishing SDKs via GitHub

This guide explains how to make `@erc8004/sdk` and `@erc8004/agentic-trust-sdk` installable from GitHub for other projects.

## Method 1: Direct Git Installation (Simplest)

Projects can install the SDKs directly from GitHub using git URLs.

### Prerequisites

1. **Push your code to GitHub**:
   ```bash
   git add .
   git commit -m "Add SDKs"
   git push origin main  # or your branch name
   ```

2. **Ensure the SDKs are built**:
   ```bash
   pnpm build:sdks
   ```
   
   **Important**: Commit the `dist/` folders so they're available in the repository. You may want to add a GitHub Actions workflow to build automatically (see below).

### Installation in Other Projects

In your other project's `package.json`, add:

```json
{
  "dependencies": {
    "@erc8004/sdk": "git+https://github.com/Agentic-Trust-Layer/agent-explorer.git#main:apps/erc8004-src",
    "@erc8004/agentic-trust-sdk": "git+https://github.com/Agentic-Trust-Layer/agent-explorer.git#main:apps/erc8004-agentic-trust-sdk"
  }
}
```

Or for a specific branch/tag:
```json
{
  "dependencies": {
    "@erc8004/sdk": "git+https://github.com/Agentic-Trust-Layer/agent-explorer.git#v1.0.0:apps/erc8004-src",
    "@erc8004/agentic-trust-sdk": "git+https://github.com/Agentic-Trust-Layer/agent-explorer.git#v1.0.0:apps/erc8004-agentic-trust-sdk"
  }
}
```

**Note**: The `:apps/erc8004-src` part tells npm/pnpm to install from that subdirectory.

### Install the packages:

```bash
pnpm install
# or
npm install
```

## Method 2: GitHub Packages (Recommended for Production)

GitHub Packages provides an npm registry hosted on GitHub, similar to npmjs.com but private to your organization/account.

### Step 1: Configure package.json for GitHub Packages

Update both SDK `package.json` files to include `publishConfig`:

**For `apps/erc8004-src/package.json`**:
```json
{
  "name": "@erc8004/sdk",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "@erc8004:registry": "https://npm.pkg.github.com"
  },
  // ... rest of package.json
}
```

**For `apps/erc8004-agentic-trust-sdk/package.json`**:
```json
{
  "name": "@erc8004/agentic-trust-sdk",
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "@erc8004:registry": "https://npm.pkg.github.com"
  },
  // ... rest of package.json
}
```

### Step 2: Create GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token with these permissions:
   - `read:packages`
   - `write:packages`
   - `repo` (if repository is private)
3. Copy the token

### Step 3: Configure npm/pnpm for GitHub Packages

**For npm:**
```bash
# Login to GitHub Packages
npm login --scope=@erc8004 --registry=https://npm.pkg.github.com
# Username: your-github-username
# Password: your-personal-access-token
```

**For pnpm:**
```bash
# Create/edit .npmrc in your home directory
echo "@erc8004:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> ~/.npmrc

# Or project-specific .npmrc
echo "@erc8004:registry=https://npm.pkg.github.com" > .npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> .npmrc
```

### Step 4: Publish to GitHub Packages

```bash
cd /home/barb/erc8004/erc-8004-identity-indexer

# Build both SDKs
pnpm build:sdks

# Publish @erc8004/sdk
cd apps/erc8004-src
pnpm publish --registry=https://npm.pkg.github.com

# Publish @erc8004/agentic-trust-sdk
cd ../erc8004-agentic-trust-sdk
pnpm publish --registry=https://npm.pkg.github.com
```

### Step 5: Install in Other Projects

In your other project, create `.npmrc`:
```
@erc8004:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

Then in `package.json`:
```json
{
  "dependencies": {
    "@erc8004/sdk": "^1.0.0",
    "@erc8004/agentic-trust-sdk": "^1.0.0"
  }
}
```

Install:
```bash
pnpm install
```

## Method 3: Automated Build with GitHub Actions

Set up GitHub Actions to automatically build and publish on each release.

### Create `.github/workflows/publish-sdks.yml`:

```yaml
name: Publish SDKs

on:
  release:
    types: [created]
  workflow_dispatch:

jobs:
  publish-sdks:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    
    steps:
      - uses: actions/checkout@v4
      
      - uses: pnpm/action-setup@v2
        with:
          version: 9.7.0
      
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          registry-url: 'https://npm.pkg.github.com'
          scope: '@erc8004'
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Build SDKs
        run: pnpm build:sdks
      
      - name: Publish @erc8004/sdk
        working-directory: apps/erc8004-src
        run: pnpm publish --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      
      - name: Publish @erc8004/agentic-trust-sdk
        working-directory: apps/erc8004-agentic-trust-sdk
        run: pnpm publish --no-git-checks
        env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Usage:

1. Create a release on GitHub (tags the repository)
2. The workflow automatically builds and publishes both SDKs
3. Install using Method 2 (GitHub Packages)

## Quick Setup Script

Add this to your root `package.json` scripts:

```json
{
  "scripts": {
    "publish:sdk:github": "pnpm build:sdks && cd apps/erc8004-src && pnpm publish --registry=https://npm.pkg.github.com && cd ../erc8004-agentic-trust-sdk && pnpm publish --registry=https://npm.pkg.github.com"
  }
}
```

## Versioning

Before publishing, update version in `package.json`:

```bash
# For @erc8004/sdk
cd apps/erc8004-src
# Edit package.json version: "1.0.1"
git add package.json
git commit -m "Bump @erc8004/sdk to v1.0.1"
git tag @erc8004/sdk@1.0.1

# For @erc8004/agentic-trust-sdk
cd ../erc8004-agentic-trust-sdk
# Edit package.json version: "1.0.1"
git add package.json
git commit -m "Bump @erc8004/agentic-trust-sdk to v1.0.1"
git tag @erc8004/agentic-trust-sdk@1.0.1
```

## Troubleshooting

### Git installation issues

- **"Cannot find package"**: Ensure `dist/` folders are committed
- **"Module not found"**: Check that the path (`:apps/erc8004-src`) is correct
- **Build errors**: Ensure dependencies are installed in the monorepo

### GitHub Packages issues

- **401 Unauthorized**: Check your token has correct permissions
- **403 Forbidden**: Ensure `.npmrc` is configured correctly
- **404 Not Found**: Verify package name matches GitHub organization/username

### Cross-repository dependencies

Note that `@erc8004/agentic-trust-sdk` depends on `@erc8004/sdk`. When installing via Git, both need to be installed:

```json
{
  "dependencies": {
    "@erc8004/sdk": "git+https://github.com/Agentic-Trust-Layer/agent-explorer.git#main:apps/erc8004-src",
    "@erc8004/agentic-trust-sdk": "git+https://github.com/Agentic-Trust-Layer/agent-explorer.git#main:apps/erc8004-agentic-trust-sdk"
  }
}
```

Make sure `@erc8004/sdk` is listed first so it installs before `@erc8004/agentic-trust-sdk`.

