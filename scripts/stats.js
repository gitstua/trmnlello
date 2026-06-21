#!/usr/bin/env node
// Usage: node scripts/stats.js
// Live "right now" install-base snapshot, read directly from KV user records.
// For stored/historical analytics (renders, columns, trends) use analytics.js.
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
  return JSON.parse(wrangler(`list --prefix ${JSON.stringify(prefix)}`)).map(k => k.name);
}

console.log('Fetching live KV stats...\n');
const userKeys = listKeys('user:');
const total = userKeys.length;
console.log(`Total users:         ${total}`);

if (total > 0) {
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
} else {
  console.log('No users yet.');
}
