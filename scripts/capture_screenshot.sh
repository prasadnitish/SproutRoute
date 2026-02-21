#!/usr/bin/env bash
set -euo pipefail

# Capture a full-screen screenshot to docs/screenshot.png (macOS screencapture).
# Make sure the SproutRoute app is visible before running this.

OUTPUT_PATH="${1:-docs/screenshot.png}"

screencapture -x "$OUTPUT_PATH"
echo "Saved screenshot to $OUTPUT_PATH"
