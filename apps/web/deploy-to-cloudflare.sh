#!/bin/bash
# Deployment script for Cloudflare Pages
# This script cleans cache files and deploys the built Next.js app

set -e

echo "🚀 Preparing deployment to Cloudflare Pages..."

# Navigate to web directory
cd "$(dirname "$0")"

# Check if .next exists
if [ ! -d ".next" ]; then
  echo "❌ Error: .next directory not found. Please build the project first:"
  echo "   cd ../.. && pnpm build:sdks && NODE_ENV=production pnpm --filter erc8004-web build"
  exit 1
fi

# Ensure we're working with a production build
echo "✅ Using production build from .next directory"

# Remove cache directories and large files that shouldn't be deployed
echo "🧹 Cleaning cache files and large build artifacts..."

# Remove cache directories
rm -rf .next/cache .next/trace

# Remove source maps (they can be very large)
find .next -name "*.map" -type f -delete 2>/dev/null || true

# Remove webpack cache files (can be very large)
find .next -name "*.pack.gz" -type f -delete 2>/dev/null || true
find .next -path "*/cache/webpack/*" -type f -delete 2>/dev/null || true

# Remove any remaining large cache directories
find .next -type d -name "cache" -exec rm -rf {} + 2>/dev/null || true

# Remove database files (transitioned to cloud database)
echo "🗑️  Removing old database files..."
find . -maxdepth 5 -name "*.db" -type f -delete 2>/dev/null || true
find . -maxdepth 5 -name "*.sqlite" -type f -delete 2>/dev/null || true
find . -maxdepth 5 -name "*.sqlite3" -type f -delete 2>/dev/null || true

# Check for large files (warn but don't fail)
echo "📊 Checking for remaining large files..."
LARGE_FILES=$(find .next -type f -size +20M 2>/dev/null || true)
if [ -n "$LARGE_FILES" ]; then
  echo "⚠️  Warning: Found files larger than 20MB:"
  echo "$LARGE_FILES" | head -10
  echo ""
  echo "Attempting to identify and remove large unnecessary files..."
  
  # Try to remove specific large patterns
  find .next -type f -size +20M \( -name "*.pack.gz" -o -name "*.cache" -o -name "*.log" \) -delete 2>/dev/null || true
fi

# Final check for files over 25MB (Cloudflare limit)
CRITICAL_FILES=$(find .next -type f -size +25M 2>/dev/null || true)
if [ -n "$CRITICAL_FILES" ]; then
  echo "❌ Error: Files larger than 25MB found (Cloudflare limit):"
  echo "$CRITICAL_FILES"
  echo ""
  echo "Please review and remove these files manually or exclude them from deployment."
  exit 1
fi

# Deploy to Cloudflare Pages
echo "📤 Deploying to Cloudflare Pages..."
wrangler pages deploy .next --project-name=erc8004-web --commit-dirty=true

echo "✅ Deployment complete!"

