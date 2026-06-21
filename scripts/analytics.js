#!/usr/bin/env node
// Usage: node scripts/analytics.js
// Queries all stored analytics from Workers Analytics Engine — renders, board
// shape (columns/cards), timezones, and the daily install-base snapshot.
//
// Requires two environment variables:
//   CLOUDFLARE_ACCOUNT_ID  — your account id (npx wrangler whoami)
//   CLOUDFLARE_API_TOKEN   — a token with "Account Analytics: Read"
//
// All aggregate — no per-user data, no board names, no tokens.

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const DATASET = 'trmnlello_renders';

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN first.');
  console.error('  CLOUDFLARE_ACCOUNT_ID — from `npx wrangler whoami`');
  console.error('  CLOUDFLARE_API_TOKEN  — a token with "Account Analytics: Read"');
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`,
    { method: 'POST', headers: { Authorization: `Bearer ${API_TOKEN}` }, body: sql }
  );
  if (!res.ok) throw new Error(`Query failed: ${res.status} ${await res.text()}`);
  return (await res.json()).data;
}

const r = n => Math.round(Number(n) || 0);

console.log('Querying Analytics Engine...\n');

// ── Renders (event flow). double1=count, double2=columns, double3=cards ──
// _sample_interval keeps counts accurate if sampling kicks in at high volume.
const today = await query(`
  SELECT SUM(_sample_interval) AS renders
  FROM ${DATASET} WHERE blob1 = 'render' AND timestamp >= toStartOfDay(now())
`);
console.log(`Board renders today: ${r(today[0]?.renders)}`);

console.log('\nRenders, last 7 days:');
const daily = await query(`
  SELECT toStartOfDay(timestamp) AS day, SUM(_sample_interval) AS renders
  FROM ${DATASET} WHERE blob1 = 'render' AND timestamp >= now() - INTERVAL '7' DAY
  GROUP BY day ORDER BY day
`);
for (const row of daily) console.log(`  ${row.day.slice(0, 10)}   ${r(row.renders)}`);

// ── Board shape (weighted to stay correct under sampling) ──
const shape = await query(`
  SELECT
    SUM(double2 * _sample_interval) / SUM(_sample_interval) AS avg_cols,
    MAX(double2) AS max_cols,
    SUM(double3 * _sample_interval) / SUM(_sample_interval) AS avg_cards,
    MAX(double3) AS max_cards
  FROM ${DATASET} WHERE blob1 = 'render' AND timestamp >= now() - INTERVAL '1' DAY
`);
if (shape[0]) {
  console.log('\nBoard shape (last 24h):');
  console.log(`  Columns: avg ${Number(shape[0].avg_cols).toFixed(1)}, max ${r(shape[0].max_cols)}`);
  console.log(`  Cards:   avg ${Number(shape[0].avg_cards).toFixed(1)}, max ${r(shape[0].max_cards)}`);
}

// ── Renders by timezone ──
const tz = await query(`
  SELECT blob2 AS timezone, SUM(_sample_interval) AS renders
  FROM ${DATASET} WHERE blob1 = 'render' AND timestamp >= now() - INTERVAL '1' DAY
  GROUP BY timezone ORDER BY renders DESC
`);
if (tz.length) {
  console.log('\nRenders by timezone (last 24h):');
  for (const row of tz) console.log(`  ${String(r(row.renders)).padStart(5)}  ${row.timezone || '(unknown)'}`);
}

// ── Daily install-base snapshot (gauge values, one row/day) ──
// double1=total_users double2=active_today double3=active_7d
// double4=active_30d double5=boards_configured double6=distinct_boards
const installBase = await query(`
  SELECT toStartOfDay(timestamp) AS day,
         MAX(double1) AS users, MAX(double2) AS active, MAX(double6) AS boards
  FROM ${DATASET} WHERE blob1 = 'daily_stats' AND timestamp >= now() - INTERVAL '30' DAY
  GROUP BY day ORDER BY day
`);
if (installBase.length) {
  console.log('\nInstall base (daily snapshot):');
  console.log('  Date         Users  Active  Boards');
  for (const row of installBase) {
    console.log(`  ${row.day.slice(0, 10)}  ${String(r(row.users)).padStart(5)}  ${String(r(row.active)).padStart(6)}  ${String(r(row.boards)).padStart(6)}`);
  }
} else {
  console.log('\nInstall base: no daily snapshot yet (cron runs 00:10 UTC).');
}
