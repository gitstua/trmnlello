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

User records are stored in Cloudflare KV with a rolling 90-day TTL, reset once per day on device refresh. Uninstalling deletes the record immediately via the uninstall webhook.

## Scaling & when to upgrade

The plugin runs comfortably on the Cloudflare **free tier**. The binding constraint is **KV writes** (1,000/day on free). Each active user costs roughly 3 writes/day — the TTL touch only fires once per day, not on every poll — so:

| Resource | Free tier limit | Approx. user ceiling |
|----------|-----------------|----------------------|
| KV writes | 1,000/day | **~300 active users** (this is the limit you hit first) |
| KV reads | 100,000/day | ~1,000 users |
| Worker requests | 100,000/day | ~1,000 users |

**When to upgrade:** as active users approach **~250**, move to the **Workers Paid** plan ($5/month). It raises the write ceiling to ~330,000/day (≈100,000 users before any usage-based charges). Watch your numbers with `npm run stats`.

**Important:** the Paid plan does **not** include an uptime SLA — Cloudflare only offers SLAs on Business/Enterprise plans. Upgrading is purely about raising the free-tier limits, not about availability guarantees. The service remains best-effort regardless of plan.

If KV writes are exhausted on the free tier, writes fail silently — tokens stop getting their TTL refreshed and would eventually expire, effectively logging users out. That's the symptom to watch for if you ever exceed the free limits unexpectedly.
