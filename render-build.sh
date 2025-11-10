#!/usr/bin/env bash
set -e
echo "Installing Puppeteer bundled Chromium..."
# This installs the Chromium binary used by puppeteer on CI/deploy hosts.
npx puppeteer install
echo "Puppeteer install complete"
