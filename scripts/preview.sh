#!/usr/bin/env bash
# Starts the local dev server and opens the preview in a browser.
# Usage: ./scripts/preview.sh [full|half_vertical|half_horizontal|quadrant]

set -e

LAYOUT=${1:-full}
URL="http://localhost:8787/preview?layout=${LAYOUT}"

echo "Starting dev server..."
npx wrangler dev &
WRANGLER_PID=$!

# Wait for the server to be ready
echo "Waiting for server..."
until curl -s -o /dev/null "$URL"; do
  sleep 1
done

echo "Opening $URL"
open "$URL"

# Keep server running until Ctrl+C
trap "kill $WRANGLER_PID 2>/dev/null" EXIT
wait $WRANGLER_PID
