# Security Policy

## Reporting a vulnerability

Please do not report security vulnerabilities via GitHub issues.

Instead, please report them via [TRMNL support](https://help.trmnl.com) with a description of the issue, steps to reproduce, and any potential impact.

## Scope

This policy covers the trmnlello Cloudflare Worker and its handling of Trello OAuth tokens and TRMNL access tokens.

## Data handling

- Trello OAuth tokens are stored in Cloudflare KV with a rolling 90-day expiry
- Tokens are scoped to read-only Trello access
- Tokens are deleted immediately on plugin uninstall, or automatically after 90 days of inactivity
- No Trello credentials are logged or transmitted to third parties beyond the Trello API itself
