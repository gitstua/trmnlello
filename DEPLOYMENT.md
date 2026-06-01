# Deployment

Notes for running your own instance of trmnlello.

## Prerequisites

- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is fine)
- [Trello Power-Up](https://trello.com/power-ups/admin) with an API key and secret
- TRMNL account with a plugin registered

## First-time setup

### 1. Create a Cloudflare KV namespace

```bash
npx wrangler login
npx wrangler kv namespace create TRMNLELLO
```

Copy the `id` from the output into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"
```

### 2. Get Trello credentials

Go to https://trello.com/power-ups/admin and create a Power-Up. Copy the **API Key** and **Secret**, and add your worker URL to **Allowed origins**:

```
https://trmnlello.<your-subdomain>.workers.dev
```

### 3. Register a TRMNL plugin

In TRMNL, create a new plugin with these URLs:

| Field | Value |
|-------|-------|
| Installation URL | `https://trmnlello.…workers.dev/install` |
| Plugin Markup URL | `https://trmnlello.…workers.dev/markup` |
| Plugin Management URL | `https://trmnlello.…workers.dev/manage` |
| Install success webhook | `https://trmnlello.…workers.dev/webhooks/installation_success` |
| Uninstall webhook | `https://trmnlello.…workers.dev/webhooks/uninstall` |

Copy the **Client ID** and **Client Secret** TRMNL provides.

### 4. Set secrets

```bash
npx wrangler secret put TRELLO_API_KEY
npx wrangler secret put TRELLO_API_SECRET
npx wrangler secret put TRMNL_CLIENT_ID
npx wrangler secret put TRMNL_CLIENT_SECRET
```

### 5. Deploy

```bash
npm run deploy
```

## Local development

```bash
cp .dev.vars.example .dev.vars
# fill in TRELLO_API_KEY, TRELLO_API_SECRET, TRMNL_CLIENT_ID, TRMNL_CLIENT_SECRET
npm run dev
```

The worker runs at `http://localhost:8787`. TRMNL cannot reach localhost, so the full install flow requires a deployed worker (or a tunnel like ngrok).

## Data storage

User records are stored in Cloudflare KV with a rolling 90-day TTL, reset on every device refresh. Uninstalling deletes the record immediately via the uninstall webhook.
