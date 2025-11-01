#!/bin/bash
# Script to check differences between local wrangler.toml and Cloudflare dashboard

echo "🔍 Checking Cloudflare Worker Configuration..."
echo ""

# Check secrets
echo "📋 Secrets on Cloudflare (production):"
npx wrangler secret list 2>&1 | grep -v "No secrets found" || echo "  (No secrets found or not authenticated)"
echo ""

# Check development secrets if exists
echo "📋 Secrets on Cloudflare (development):"
npx wrangler secret list --env development 2>&1 | grep -v "No secrets found" || echo "  (No secrets found)"
echo ""

# Show local wrangler.toml vars
echo "📝 Environment variables in local wrangler.toml:"
if [ -f "wrangler.toml" ]; then
  grep -A 10 "^\[vars\]" wrangler.toml || echo "  No [vars] section found"
  grep -A 10 "^\[env.development.vars\]" wrangler.toml || echo "  No [env.development.vars] section found"
else
  echo "  wrangler.toml not found"
fi

echo ""
echo "💡 To sync changes from dashboard:"
echo "   1. Check the Cloudflare Dashboard → Workers → Settings → Variables"
echo "   2. Copy any variables to wrangler.toml under [vars] or [env.development.vars]"
echo "   3. For secrets, use: npx wrangler secret put SECRET_NAME"
echo ""

