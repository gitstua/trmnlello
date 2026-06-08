#!/usr/bin/env bash
# Usage: ./scripts/debug.sh [on|off]
# Enables or disables debug logging on the deployed worker, then tails logs.

set -e

ACTION=${1:-on}

case "$ACTION" in
  on|enable|true)
    echo "Enabling debug logging..."
    echo "true" | npx wrangler secret put DEBUG
    ;;
  off|disable|false)
    echo "Disabling debug logging..."
    npx wrangler secret delete DEBUG --force 2>/dev/null || npx wrangler secret delete DEBUG
    ;;
  *)
    echo "Usage: $0 [on|off]"
    exit 1
    ;;
esac

echo ""
echo "Tailing logs (Ctrl+C to stop)..."
npx wrangler tail
