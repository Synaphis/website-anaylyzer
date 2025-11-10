#!/usr/bin/env bash
set -e
echo "📦 Installing Chromium for Puppeteer into ./chrome (persistent in artifact)..."

# Ensure chrome directory exists
mkdir -p chrome

# Install chrome into the local ./chrome cache (persistent inside the build)
# PUPPETEER_CACHE_DIR ensures puppeteer will extract into ./chrome
PUPPETEER_CACHE_DIR=./chrome npx puppeteer browsers install chrome

echo "✅ Chromium installation complete (into ./chrome)."
