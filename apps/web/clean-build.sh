#!/bin/bash
# Clean build script for Cloudflare Pages deployment
# Removes cache and other unnecessary files before deployment

set -e

echo "Cleaning build artifacts..."

# Remove Next.js cache
if [ -d ".next/cache" ]; then
  echo "Removing .next/cache..."
  rm -rf .next/cache
fi

# Remove webpack cache specifically
if [ -d ".next/cache/webpack" ]; then
  echo "Removing webpack cache..."
  rm -rf .next/cache/webpack
fi

# Remove trace files
if [ -d ".next/trace" ]; then
  echo "Removing .next/trace..."
  rm -rf .next/trace
fi

echo "Clean complete! Ready for deployment."

