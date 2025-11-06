#!/bin/bash
# Deployment script for Cloudflare Workers (ERC-8004 Indexer)
# This script deploys the GraphQL API Worker to Cloudflare

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Deploying ERC-8004 Indexer to Cloudflare Workers...${NC}"
echo ""

# Navigate to indexer directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}⚠️  Wrangler CLI not found. Installing...${NC}"
    pnpm add -D wrangler
fi

# Check if user is logged in to Cloudflare
echo -e "${BLUE}🔐 Checking Cloudflare authentication...${NC}"
if ! npx wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}⚠️  Not logged in to Cloudflare. Please log in:${NC}"
    echo "   npx wrangler login"
    exit 1
fi

echo -e "${GREEN}✅ Authenticated with Cloudflare${NC}"
echo ""

# Determine environment (default to production)
ENV=${1:-production}
if [ "$ENV" != "production" ] && [ "$ENV" != "dev" ] && [ "$ENV" != "development" ]; then
    echo -e "${RED}❌ Invalid environment: $ENV${NC}"
    echo "Usage: $0 [production|dev|development]"
    exit 1
fi

# Normalize environment name
if [ "$ENV" = "dev" ]; then
    ENV="development"
fi

echo -e "${BLUE}📦 Environment: ${ENV}${NC}"
echo ""

# Check if .env file exists and warn about secrets
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  Note: .env file found. Make sure all required secrets are set in Cloudflare:${NC}"
    echo "   - GRAPHQL_SECRET_ACCESS_CODE (use: wrangler secret put GRAPHQL_SECRET_ACCESS_CODE)"
    echo ""
fi

# Check if secrets need to be set
echo -e "${BLUE}🔍 Checking for required secrets...${NC}"
if [ "$ENV" = "production" ]; then
    SECRET_CHECK=$(npx wrangler secret list 2>&1 | grep -i "GRAPHQL_SECRET_ACCESS_CODE" || echo "")
    if [ -z "$SECRET_CHECK" ]; then
        echo -e "${YELLOW}⚠️  GRAPHQL_SECRET_ACCESS_CODE secret not found.${NC}"
        echo -e "${YELLOW}   Set it with: npx wrangler secret put GRAPHQL_SECRET_ACCESS_CODE${NC}"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    else
        echo -e "${GREEN}✅ Required secrets found${NC}"
    fi
fi

echo ""

# Check if migrations need to be run
echo -e "${BLUE}🗄️  Checking database migrations...${NC}"
read -p "Run database migrations before deployment? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${BLUE}Running migrations...${NC}"
    pnpm d1:migrate || {
        echo -e "${YELLOW}⚠️  Migration failed or already applied. Continuing...${NC}"
    }
fi

echo ""

# Build/compile check (TypeScript files should be compiled by wrangler, but we can verify)
echo -e "${BLUE}🔨 Verifying source files...${NC}"
if [ ! -f "src/worker.ts" ]; then
    echo -e "${RED}❌ Error: src/worker.ts not found${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Source files found${NC}"
echo ""

# Deploy to Cloudflare
echo -e "${BLUE}📤 Deploying to Cloudflare Workers...${NC}"
if [ "$ENV" = "development" ]; then
    echo -e "${BLUE}   Using development environment...${NC}"
    pnpm deploy:dev || npx wrangler deploy --env development
else
    echo -e "${BLUE}   Using production environment...${NC}"
    pnpm deploy || npx wrangler deploy
fi

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""

# Get deployment URL
if [ "$ENV" = "development" ]; then
    WORKER_NAME="erc8004-indexer-graphql-dev"
else
    WORKER_NAME="erc8004-indexer-graphql"
fi

echo -e "${GREEN}📋 Deployment Information:${NC}"
echo "   Worker Name: $WORKER_NAME"
echo "   GraphQL Endpoint: https://$WORKER_NAME.$(npx wrangler whoami 2>/dev/null | grep -oP 'email: \K[^@]+' || echo 'YOUR-SUBDOMAIN').workers.dev/graphql"
echo ""

# Test the deployment
echo -e "${BLUE}🧪 Testing deployment...${NC}"
read -p "Test the GraphQL endpoint? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    WORKER_URL="https://$WORKER_NAME.$(npx wrangler whoami 2>/dev/null | grep -oP 'email: \K[^@]+' || echo 'YOUR-SUBDOMAIN').workers.dev/graphql"
    echo -e "${BLUE}   Testing: $WORKER_URL${NC}"
    
    # Test with a simple GraphQL query
    RESPONSE=$(curl -s -X POST "$WORKER_URL" \
        -H "Content-Type: application/json" \
        -d '{"query":"{ __typename }"}' 2>&1 || echo "ERROR")
    
    if echo "$RESPONSE" | grep -q "data\|__typename"; then
        echo -e "${GREEN}✅ GraphQL endpoint is responding!${NC}"
    else
        echo -e "${YELLOW}⚠️  Could not verify GraphQL endpoint. Please test manually.${NC}"
        echo "   Response: $RESPONSE"
    fi
fi

echo ""
echo -e "${GREEN}🎉 All done!${NC}"
echo ""
echo -e "${BLUE}📝 Next steps:${NC}"
echo "   1. Update your web app's GRAPHQL_API_URL environment variable"
echo "   2. Test the GraphQL API in GraphiQL or your app"
echo "   3. Monitor logs: npx wrangler tail"
echo ""

