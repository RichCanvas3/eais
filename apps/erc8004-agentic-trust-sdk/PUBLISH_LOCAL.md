# Publishing @erc8004/agentic-trust-sdk for Local Use

This guide explains how to make `@erc8004/agentic-trust-sdk` available to other projects on your WSL machine.

## Prerequisites

1. Build both SDKs first:
   ```bash
   cd /home/barb/erc8004/erc-8004-identity-indexer
   pnpm build:sdks
   ```

## Method 1: Using file: protocol (Recommended - Simplest for Local Development)

Add the packages directly to your other project's `package.json`:

```json
{
  "dependencies": {
    "@erc8004/sdk": "file:/home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-src",
    "@erc8004/agentic-trust-sdk": "file:/home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-agentic-trust-sdk"
  }
}
```

Then run:
```bash
pnpm install
```

**Note**: This will copy the packages into `node_modules`, so you'll need to reinstall if you make changes to the SDKs.

## Method 2: Using pnpm pack (Portable Tarballs)

Creates a portable tarball that can be installed like a regular npm package.

### Step 1: Create tarballs

```bash
cd /home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-src
pnpm pack
# Creates: erc8004-sdk-1.0.0.tgz

cd /home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-agentic-trust-sdk
pnpm pack
# Creates: erc8004-agentic-trust-sdk-1.0.0.tgz
```

### Step 2: In your other project

```bash
cd /path/to/your/other/project
pnpm install /home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-src/erc8004-sdk-1.0.0.tgz
pnpm install /home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-agentic-trust-sdk/erc8004-agentic-trust-sdk-1.0.0.tgz
```

Or add to `package.json`:
```json
{
  "dependencies": {
    "@erc8004/sdk": "file:/home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-src/erc8004-sdk-1.0.0.tgz",
    "@erc8004/agentic-trust-sdk": "file:/home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-agentic-trust-sdk/erc8004-agentic-trust-sdk-1.0.0.tgz"
  }
}
```

## Method 3: Publishing to npm (For Public/Team Use)

If you want to publish to npm (public or private registry):

### Step 1: Configure npm access

```bash
npm login
```

### Step 2: Publish both packages

```bash
cd /home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-src
pnpm publish --access public  # or --access restricted for private

cd /home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-agentic-trust-sdk
pnpm publish --access public  # or --access restricted for private
```

### Step 3: In your other project

```bash
pnpm install @erc8004/sdk @erc8004/agentic-trust-sdk
```

## Development Workflow Tips

1. **Watch mode**: If using `file:` or `link:`, the SDKs will rebuild automatically:
   ```bash
   cd /home/barb/erc8004/erc-8004-identity-indexer/apps/erc8004-agentic-trust-sdk
   pnpm dev  # Runs tsc --watch
   ```

2. **Rebuild after changes**: If using tarballs, rebuild and repack:
   ```bash
   pnpm build && pnpm pack
   ```

3. **Check installation**: Verify the packages are installed correctly:
   ```bash
   # In your other project
   node -e "console.log(require('@erc8004/agentic-trust-sdk'))"
   ```

## Troubleshooting

### Link not working
- Make sure both SDKs are built (`pnpm build`)
- Check that `dist/` directories exist
- Verify `package.json` main/types fields point to correct files

### Module not found
- Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`
- Check that TypeScript can find the types: `dist/index.d.ts` exists

### Version conflicts
- Both SDKs should be at compatible versions
- Clear pnpm store: `pnpm store prune`

