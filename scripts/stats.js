#!/usr/bin/env node
// Usage:
//   node scripts/stats.js            live snapshot from current KV state
//   node scripts/stats.js history    historical daily snapshots (stats:* keys)
//   node scripts/stats.js seed       compute + write today's snapshot now
// Reads only aggregate data — no secrets or PII printed.

import { execSync } from 'child_process';

const NAMESPACE_ID = 'd6b4182549cb4d46801906fb9bd97721';

// --remote targets production KV; without it wrangler reads the local .wrangler state
function wrangler(cmd) {
  return execSync(`npx wrangler kv key ${cmd} --namespace-id=${NAMESPACE_ID} --remote`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function wranglerGet(key) {
  try {
    const out = execSync(
      `npx wrangler kv key get --namespace-id=${NAMESPACE_ID} --remote ${JSON.stringify(key)}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return JSON.parse(out);
  } catch {
    return null;
  }
}

function listKeys(prefix) {
  const raw = wrangler(`list --prefix ${JSON.stringify(prefix)}`);
  return JSON.parse(raw).map(k => k.name);
}

// Compute today's aggregate from live KV and write it as a stats:DATE key.
// Mirrors the worker's cron job — useful to seed history or snapshot on demand.
function seedSnapshot() {
  console.log('Computing aggregate snapshot...');
  const userKeys = listKeys('user:');
  const now = Date.now();
  const DAY = 86400_000;
  const date = new Date().toISOString().slice(0, 10);
  const stats = {
    date, generated_at: new Date().toISOString(),
    total_users: 0, boards_configured: 0, setup_incomplete: 0,
    active_today: 0, active_7d: 0, active_30d: 0, distinct_boards: 0, by_timezone: {},
  };
  const boardIds = new Set();
  for (const key of userKeys) {
    const user = wranglerGet(key);
    if (!user) continue;
    stats.total_users++;
    if (user.board_id) { stats.boards_configured++; boardIds.add(user.board_id); }
    else stats.setup_incomplete++;
    if (user.last_used) {
      const age = now - new Date(user.last_used).getTime();
      if (age < DAY) stats.active_today++;
      if (age < 7 * DAY) stats.active_7d++;
      if (age < 30 * DAY) stats.active_30d++;
    }
    if (user.timezone) stats.by_timezone[user.timezone] = (stats.by_timezone[user.timezone] ?? 0) + 1;
  }
  stats.distinct_boards = boardIds.size;

  execSync(
    `npx wrangler kv key put --namespace-id=${NAMESPACE_ID} --remote "stats:${date}" ${JSON.stringify(JSON.stringify(stats))}`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }
  );
  console.log(`Wrote stats:${date} (${stats.total_users} users, ${stats.active_today} active today)`);
}

function showHistory() {
  console.log('Fetching daily snapshots...\n');
  const keys = listKeys('stats:').sort();
  if (keys.length === 0) {
    console.log('No snapshots yet — the daily cron writes the first one at 00:10 UTC.');
    return;
  }

  console.log('Date         Users  Boards  Active(1d)  Active(7d)  Active(30d)');
  console.log('─'.repeat(66));
  for (const key of keys) {
    const s = wranglerGet(key);
    if (!s) continue;
    console.log(
      `${s.date}   ${String(s.total_users).padStart(5)}  ${String(s.distinct_boards).padStart(6)}  ` +
      `${String(s.active_today).padStart(10)}  ${String(s.active_7d).padStart(10)}  ${String(s.active_30d).padStart(11)}`
    );
  }

  // Timezone distribution from the most recent snapshot
  const latest = wranglerGet(keys[keys.length - 1]);
  if (latest?.by_timezone && Object.keys(latest.by_timezone).length) {
    console.log(`\nTimezones (as of ${latest.date}):`);
    Object.entries(latest.by_timezone)
      .sort((a, b) => b[1] - a[1])
      .forEach(([tz, n]) => console.log(`  ${String(n).padStart(3)}  ${tz}`));
  }
}

function showLive() {
  console.log('Fetching live KV stats...\n');
  const userKeys = listKeys('user:');
  const total = userKeys.length;
  console.log(`Total users:         ${total}`);
  if (total === 0) {
    console.log('No users yet.');
    return;
  }

  let withBoard = 0, activeToday = 0, active7d = 0, active30d = 0, neverUsed = 0;
  const now = Date.now();
  const DAY = 86400_000;
  const byTimezone = {};

  for (const key of userKeys) {
    const user = wranglerGet(key);
    if (!user) continue;
    if (user.board_id) withBoard++;
    if (user.timezone) byTimezone[user.timezone] = (byTimezone[user.timezone] ?? 0) + 1;
    if (!user.last_used) { neverUsed++; continue; }
    const age = now - new Date(user.last_used).getTime();
    if (age < DAY)      activeToday++;
    if (age < 7 * DAY)  active7d++;
    if (age < 30 * DAY) active30d++;
  }

  console.log(`Board configured:    ${withBoard}`);
  console.log(`Setup incomplete:    ${total - withBoard}`);
  console.log('');
  console.log(`Active today:        ${activeToday}`);
  console.log(`Active last 7 days:  ${active7d}`);
  console.log(`Active last 30 days: ${active30d}`);
  console.log(`Never polled:        ${neverUsed}`);

  if (Object.keys(byTimezone).length) {
    console.log('\nTimezones:');
    Object.entries(byTimezone)
      .sort((a, b) => b[1] - a[1])
      .forEach(([tz, n]) => console.log(`  ${String(n).padStart(3)}  ${tz}`));
  }
}

const mode = process.argv[2];
if (mode === 'history')   showHistory();
else if (mode === 'seed') seedSnapshot();
else                      showLive();
