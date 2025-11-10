#!/usr/bin/env bash
set -e
echo "Installing Puppeteer bundled Chromium..."
# installs Chromium used by puppeteer in CI hosts
npx puppeteer install
echo "Done puppeteer install"
