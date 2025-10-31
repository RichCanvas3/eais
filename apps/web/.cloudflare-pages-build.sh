#!/bin/bash
# Build script for Cloudflare Pages deployment
# This script runs from the monorepo root

set -e

echo "Building SDKs..."
pnpm build:sdks

echo "Building web application..."
cd apps/web
pnpm build

echo "Build complete!"

