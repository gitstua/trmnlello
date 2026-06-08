import * as trello from './trello.js';
import * as markup from './markup.js';
import { verifyManageJwt } from './jwt.js';

// KV key helpers
const userKey = token => `user:${token}`;
const reqTokenKey = token => `reqtoken:${token}`;

// Tokens inactive for longer than this are expired automatically
const USER_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

async function kvGet(kv, key) {
  const v = await kv.get(key);
  return v ? JSON.parse(v) : null;
}
async function kvPut(kv, key, value, opts) {
  await kv.put(key, JSON.stringify(value), opts);
}
async function kvTouch(kv, key, value) {
  // Rewrite with a fresh rolling TTL so inactive tokens expire automatically
  await kv.put(key, JSON.stringify(value), { expirationTtl: USER_TTL_SECONDS });
}

function baseUrl(request, env) {
  if (env.BASE_URL) return env.BASE_URL.replace(/\/$/, '');
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      // Pages may carry a secret token in the URL; never leak it via Referer
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Only allow redirects back to TRMNL — guards against open-redirect via a
// stored callback_url that didn't originate from a genuine install.
function safeTrmnlRedirect(candidate, fallback = 'https://trmnl.com') {
  try {
    const u = new URL(candidate);
    if (u.protocol === 'https:' && (u.hostname === 'trmnl.com' || u.hostname.endsWith('.trmnl.com'))) {
      return u.toString();
    }
  } catch {
    // not a valid URL — fall through
  }
  return fallback;
}

// ─── Install: TRMNL → /install?code=…&installation_callback_url=… ───────────

async function handleInstall(req, env) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const callbackUrl = url.searchParams.get('installation_callback_url');

  if (!code || !callbackUrl) {
    return new Response('Missing code or installation_callback_url', { status: 400 });
  }

  // Exchange TRMNL code for access token
  const tokenRes = await fetch('https://trmnl.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.TRMNL_CLIENT_ID,
      client_secret: env.TRMNL_CLIENT_SECRET,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return new Response(`TRMNL token exchange failed: ${tokenRes.status}`, { status: 502 });
  }

  const { access_token } = await tokenRes.json();

  // Persist partial user record
  await kvPut(env.KV, userKey(access_token), { access_token, callback_url: callbackUrl });

  // Start Trello OAuth — store request token keyed to our TRMNL token
  const trelloCallback = `${baseUrl(req, env)}/trello/callback`;
  const { oauth_token, oauth_token_secret } = await trello.getRequestToken(trelloCallback, env);

  await kvPut(env.KV, reqTokenKey(oauth_token), {
    oauth_token_secret,
    access_token,
  }, { expirationTtl: 1800 }); // 30 min TTL

  return Response.redirect(trello.authorizeUrl(oauth_token), 302);
}

// ─── Trello callback: /trello/callback?oauth_token=…&oauth_verifier=… ────────

async function handleTrelloCallback(req, env) {
  const url = new URL(req.url);
  const oauthToken = url.searchParams.get('oauth_token');
  const oauthVerifier = url.searchParams.get('oauth_verifier');

  if (!oauthToken || !oauthVerifier) {
    return new Response('Missing oauth_token or oauth_verifier', { status: 400 });
  }

  const stored = await kvGet(env.KV, reqTokenKey(oauthToken));
  if (!stored) {
    return new Response('Unknown oauth_token — session expired', { status: 400 });
  }

  const { oauth_token: trelloToken, oauth_token_secret: trelloSecret } =
    await trello.getAccessToken(oauthToken, stored.oauth_token_secret, oauthVerifier, env);

  await env.KV.delete(reqTokenKey(oauthToken));

  // Update user with Trello credentials
  const user = await kvGet(env.KV, userKey(stored.access_token)) ?? {};
  await kvPut(env.KV, userKey(stored.access_token), {
    ...user,
    trello_token: trelloToken,
    trello_secret: trelloSecret,
  });

  const boardSelectUrl = `${baseUrl(req, env)}/board-select?t=${encodeURIComponent(stored.access_token)}`;
  return Response.redirect(boardSelectUrl, 302);
}

// ─── Board selection ──────────────────────────────────────────────────────────

async function handleBoardSelectGet(req, env) {
  const url = new URL(req.url);
  const accessToken = url.searchParams.get('t');
  const user = accessToken && await kvGet(env.KV, userKey(accessToken));

  if (!user?.trello_token) {
    return new Response('Invalid or expired session', { status: 400 });
  }

  const boards = await trello.getBoards(user.trello_token, user.trello_secret, env);
  const options = boards.map(b =>
    `<option value="${esc(b.id)}">${esc(b.name)}</option>`
  ).join('');

  return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Trmnlello - Trello private board — Select Board</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#fff;border-radius:12px;padding:32px;max-width:420px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    h1{margin:0 0 8px;font-size:22px}
    p{color:#666;margin:0 0 24px;font-size:14px}
    select{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:16px}
    button{width:100%;padding:12px;background:#0052cc;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600}
    button:hover{background:#0041a3}
    .logo{font-size:28px;margin-bottom:12px}
    .disclaimer{margin-top:20px;padding:12px;background:#f8f8f8;border-radius:8px;font-size:11px;color:#888;line-height:1.5}
    .disclaimer a{color:#888}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⬡</div>
    <h1>Trmnlello - Trello private board</h1>
    <p>Choose which Trello board to display on your TRMNL device.</p>
    <form method="POST" action="/board-select">
      <input type="hidden" name="t" value="${esc(accessToken)}">
      <select name="board_id" required>${options}</select>
      <button type="submit">Connect Board</button>
    </form>
    <div class="disclaimer">
      <strong>Use at your own risk.</strong> Your Trello OAuth token (read-only) will be stored in Cloudflare KV.
      No warranty is provided. You can revoke access at any time via your
      <a href="https://trello.com/your-account/power-ups" target="_blank" rel="noopener noreferrer">Trello account settings</a>
      or by uninstalling this plugin.
      By connecting your board you agree to the <a href="https://github.com/gitstua/trmnlello/blob/main/TERMS.md" target="_blank" rel="noopener noreferrer">terms of use</a>.
    </div>
  </div>
</body>
</html>`);
}

async function handleBoardSelectPost(req, env) {
  const body = await req.formData();
  const accessToken = body.get('t');
  const boardId = body.get('board_id');

  const user = accessToken && await kvGet(env.KV, userKey(accessToken));
  if (!user?.trello_token) return new Response('Invalid session', { status: 400 });

  const boards = await trello.getBoards(user.trello_token, user.trello_secret, env);
  const board = boards.find(b => b.id === boardId);
  if (!board) return new Response('Board not found', { status: 400 });

  await kvPut(env.KV, userKey(accessToken), {
    ...user,
    board_id: board.id,
    board_name: board.name,
  });

  return Response.redirect(safeTrmnlRedirect(user.callback_url), 302);
}

// ─── Manage: post-install board switcher linked from TRMNL dashboard ─────────
// TRMNL opens this URL in an iframe/modal. It passes plugin_setting_uuid which
// maps to the user_uuid stored during the installation_success webhook.

async function handleManageGet(req, env) {
  const url = new URL(req.url);
  const uuid = url.searchParams.get('uuid') ?? url.searchParams.get('plugin_setting_uuid');
  const jwt = url.searchParams.get('jwt');
  if (!uuid) return new Response('Missing uuid', { status: 400 });

  try {
    await verifyManageJwt(jwt, uuid, env.TRMNL_CLIENT_ID);
  } catch (err) {
    console.error('Manage JWT verification failed:', err.message);
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await kvGet(env.KV, `uuid:${uuid}`);
  if (!user?.trello_token) return new Response('User not found', { status: 404 });

  const boards = await trello.getBoards(user.trello_token, user.trello_secret, env);
  const options = boards.map(b =>
    `<option value="${esc(b.id)}"${b.id === user.board_id ? ' selected' : ''}>${esc(b.name)}</option>`
  ).join('');

  return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Trmnlello - Trello private board — Manage</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
    .card{background:#fff;border-radius:12px;padding:32px;max-width:420px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.08)}
    h1{margin:0 0 8px;font-size:22px}
    p{color:#666;margin:0 0 24px;font-size:14px}
    select{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:15px;margin-bottom:16px}
    button{width:100%;padding:12px;background:#0052cc;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600}
    button:hover{background:#0041a3}
    .success{color:#2e7d32;font-size:14px;margin-top:12px;display:none}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:28px;margin-bottom:12px;">⬡</div>
    <h1>Trmnlello - Trello private board</h1>
    <p>Switch which Trello board appears on your device.</p>
    <form method="POST" action="/manage">
      <input type="hidden" name="uuid" value="${esc(uuid)}">
      <input type="hidden" name="jwt" value="${esc(jwt ?? '')}">
      <select name="board_id" required>${options}</select>
      <button type="submit">Save</button>
    </form>
  </div>
</body>
</html>`);
}

async function handleManagePost(req, env) {
  const body = await req.formData();
  const uuid = body.get('uuid');
  const jwt = body.get('jwt');
  const boardId = body.get('board_id');

  try {
    await verifyManageJwt(jwt, uuid, env.TRMNL_CLIENT_ID);
  } catch (err) {
    console.error('Manage JWT verification failed:', err.message);
    return new Response('Unauthorized', { status: 401 });
  }

  const user = await kvGet(env.KV, `uuid:${uuid}`);
  if (!user?.trello_token) return new Response('User not found', { status: 404 });

  const boards = await trello.getBoards(user.trello_token, user.trello_secret, env);
  const board = boards.find(b => b.id === boardId);
  if (!board) return new Response('Board not found', { status: 400 });

  const updated = { ...user, board_id: board.id, board_name: board.name };
  await kvPut(env.KV, userKey(user.access_token), updated);
  await kvPut(env.KV, `uuid:${uuid}`, updated);
  if (user.user_uuid)         await kvPut(env.KV, `uuid:${user.user_uuid}`, updated);
  if (user.plugin_setting_id) await kvPut(env.KV, `uuid:${user.plugin_setting_id}`, updated);

  const redirectTo = `https://trmnl.com/plugin_settings/${encodeURIComponent(uuid)}/edit?force_refresh=true`;

  return Response.redirect(safeTrmnlRedirect(redirectTo), 302);
}

// ─── Markup: TRMNL polls this for display content ────────────────────────────

async function handleMarkup(req, env) {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return json({ error: 'Missing Authorization' }, 401);

  const user = await kvGet(env.KV, userKey(bearer));
  if (!user) return json({ error: 'Unknown token' }, 401);

  const placeholder = markup.setup();
  if (!user.board_id || !user.trello_token) {
    return json({
      markup: placeholder,
      markup_half_vertical: placeholder,
      markup_half_horizontal: placeholder,
      markup_quadrant: placeholder,
    });
  }

  try {
    const lists = await trello.getBoardData(user.board_id, user.trello_token, user.trello_secret, env);
    // Extend TTL on every use — tokens inactive for 90 days expire automatically.
    // Refresh every index so the manage lookup keys don't expire out from under
    // an otherwise-active user.
    const touched = { ...user, last_used: new Date().toISOString() };
    await kvTouch(env.KV, userKey(bearer), touched);
    if (user.user_uuid)         await kvTouch(env.KV, `uuid:${user.user_uuid}`, touched);
    if (user.plugin_setting_id) await kvTouch(env.KV, `uuid:${user.plugin_setting_id}`, touched);
    return json(markup.allLayouts(user.board_name, lists));
  } catch (err) {
    console.error('Markup fetch failed:', err.message);
    const errHtml = markup.error('Could not fetch board data. Please try again later.');
    return json({
      markup: errHtml,
      markup_half_vertical: errHtml,
      markup_half_horizontal: errHtml,
      markup_quadrant: errHtml,
    });
  }
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

async function handleInstallSuccess(req, env) {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const body = await req.json().catch(() => ({}));
  if (bearer) {
    const user = await kvGet(env.KV, userKey(bearer)) ?? {};
    const updated = {
      ...user,
      user_uuid: body.user?.uuid,
      plugin_setting_id: body.plugin_setting_id,
    };
    await kvPut(env.KV, userKey(bearer), updated);
    // index by both user uuid and plugin_setting_id so /manage can find the user
    if (body.user?.uuid)         await kvPut(env.KV, `uuid:${body.user.uuid}`, updated);
    if (body.plugin_setting_id)  await kvPut(env.KV, `uuid:${body.plugin_setting_id}`, updated);
  }
  return json({ ok: true });
}

async function handleUninstall(req, env) {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) await env.KV.delete(userKey(bearer));
  return json({ ok: true });
}

// ─── Preview: anonymous UI preview with sample data ──────────────────────────

function handlePreview(req) {
  const url = new URL(req.url);
  const layout = url.searchParams.get('layout') ?? 'full';

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const tomorrow = new Date(now.getTime() + 86400000).toISOString();
  const nextWeek = new Date(now.getTime() + 7 * 86400000).toISOString();

  const sampleLists = [
    {
      id: '1', name: 'To Do',
      cards: [
        { id: 'c1', name: 'Set up project structure', labels: [{ color: 'blue' }, { color: 'green' }], due: null, dueComplete: false, badges: {} },
        { id: 'c2', name: 'Design the API endpoints', labels: [{ color: 'purple' }], due: tomorrow, dueComplete: false, badges: {} },
        { id: 'c3', name: 'Review requirements document — this one has a very long title to test clipping', labels: [], due: yesterday, dueComplete: false, badges: {} },
        { id: 'c4', name: 'Write unit tests', labels: [{ color: 'sky' }], due: null, dueComplete: false, badges: {} },
      ],
    },
    {
      id: '2', name: 'In Progress',
      cards: [
        { id: 'c5', name: 'Implement authentication flow', labels: [{ color: 'red' }], due: yesterday, dueComplete: false, badges: {} },
        { id: 'c6', name: 'Build dashboard UI', labels: [{ color: 'yellow' }, { color: 'orange' }], due: null, dueComplete: false, badges: {} },
        { id: 'c7', name: 'Database migrations', labels: [], due: null, dueComplete: false, badges: { checkItems: 3, checkItemsChecked: 3 } },
        { id: 'c12', name: 'Deploy to staging', labels: [], due: nextWeek, dueComplete: false, badges: {} },
      ],
    },
    {
      id: '3', name: 'Done',
      cards: [
        { id: 'c8', name: 'Project kickoff meeting', labels: [], due: null, dueComplete: true, badges: {} },
        { id: 'c9', name: 'Write technical spec', labels: [{ color: 'green' }], due: null, dueComplete: true, badges: {} },
      ],
    },
    // {
    //   id: '4', name: 'Backlog',
    //   cards: [
    //     { id: 'c10', name: 'Performance optimisation', labels: [{ color: 'lime' }], due: null, dueComplete: false, badges: {} },
    //     { id: 'c11', name: 'Accessibility audit', labels: [{ color: 'pink' }], due: null, dueComplete: false, badges: {} },
    //   ],
    // },
  ];

  const boardName = 'Sample Board (Preview)';

  const layouts = {
    full: markup.full(boardName, sampleLists),
    half_vertical: markup.halfVertical(boardName, sampleLists),
    half_horizontal: markup.halfHorizontal(boardName, sampleLists),
    quadrant: markup.quadrant(boardName, sampleLists),
  };

  const active = layouts[layout] ? layout : 'full';
  const content = layouts[active];

  // Native screen dimensions per layout for OG/BWRY (800×480 base)
  const ogDims = {
    full:             { w: 800, h: 480 },
    half_vertical:    { w: 400, h: 480 },
    half_horizontal:  { w: 800, h: 240 },
    quadrant:         { w: 400, h: 240 },
  };
  // TRMNL X (1872×1404 base) — proportional halves
  const xDims = {
    full:             { w: 1872, h: 1404 },
    half_vertical:    { w:  936, h: 1404 },
    half_horizontal:  { w: 1872, h:  702 },
    quadrant:         { w:  936, h:  702 },
  };

  const { w: ogW, h: ogH } = ogDims[active];
  const { w: xW,  h: xH  } = xDims[active];

  // Scale OG/BWRY so widest layout (800px) renders at 400px display width
  const ogScale = 400 / 800; // 0.5 always — keeps side-by-side row stable
  // Scale X so widest layout (1872px) renders at 800px display width
  const xScale  = 800 / 1872;

  const navLink = (id, label) =>
    `<a href="?layout=${id}" style="color:${active === id ? '#fff' : '#adf'};text-decoration:${active === id ? 'underline' : 'none'};font-size:12px;">${label}</a>`;

  const deviceLabel = (name, spec) =>
    `<div style="font-family:system-ui,sans-serif;margin-bottom:4px;">
      <span style="font-weight:700;font-size:13px;">${name}</span>
      <span style="font-size:11px;color:#888;margin-left:8px;">${spec}</span>
    </div>`;

  // Render the markup inside a genuine framework `.screen` so the TRMNL design
  // system itself lays out the columns — we set only the device dimensions it reads
  // (--screen-w/--screen-h) and force --pixel-ratio:1 so it renders at logical size.
  // A wrapping transform then shrinks the whole screen down to a thumbnail.
  const screen = (deviceClass, w, h, scale, filter) => {
    const dw = Math.round(w * scale);
    const dh = Math.round(h * scale);
    return `<div class="frame" style="width:${dw}px;height:${dh}px;">
      <div class="scaler" style="transform:scale(${scale})${filter ? `;filter:${filter}` : ''};">
        <div class="screen ${deviceClass}" style="--screen-w:${w}px;--screen-h:${h}px;--pixel-ratio:1;">${content}</div>
      </div>
    </div>`;
  };

  const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Trmnlello Preview — ${esc(active)}</title>
  <link rel="stylesheet" href="https://trmnl.com/css/latest/plugins.css">
  <style>
    /* Preview chrome only — the framework (.screen) owns all content layout */
    body{margin:0;background:#f0f0f0;font-family:system-ui,sans-serif;}
    .bar{background:#1a1a1a;color:#ccc;padding:8px 16px;display:flex;gap:16px;align-items:center;}
    .devices{padding:24px 32px;display:flex;flex-direction:column;gap:28px;}
    .device-row{display:flex;flex-direction:row;gap:32px;flex-wrap:wrap;}
    .frame{overflow:hidden;border:2px solid #999;background:#fff;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,.12);}
    .scaler{transform-origin:top left;}
  </style>
</head>
<body class="trmnl">
  <div class="bar">
    <span style="color:#fff;font-weight:bold;">Trmnlello Preview</span>
    ${navLink('full', 'Full')}
    ${navLink('half_vertical', 'Half Vertical')}
    ${navLink('half_horizontal', 'Half Horizontal')}
    ${navLink('quadrant', 'Quadrant')}
  </div>
  <div class="devices">
    <div class="device-row">
      <div>
        ${deviceLabel('TRMNL OG', `7.5" · ${ogW}×${ogH} · 4-level grayscale`)}
        ${screen('screen--ogv2', ogW, ogH, ogScale, 'grayscale(1)')}
      </div>
      <div>
        ${deviceLabel('TRMNL BWRY', `7.5" · ${ogW}×${ogH} · Black / White / Red / Yellow`)}
        ${screen('screen--ogv2 screen--color', ogW, ogH, ogScale, '')}
      </div>
    </div>
    <div>
      ${deviceLabel('TRMNL X', `10.3" · ${xW}×${xH} · 16-level grayscale`)}
      ${screen('screen--ogv2', xW, xH, xScale, 'grayscale(1)')}
    </div>
  </div>
  <script src="https://trmnl.com/js/latest/plugins.js"></script>
</body>
</html>`;

  return new Response(page, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;

    try {
      if (method === 'GET'  && pathname === '/install')           return handleInstall(request, env);
      if (method === 'GET'  && pathname === '/trello/callback')   return handleTrelloCallback(request, env);
      if (method === 'GET'  && pathname === '/board-select')      return handleBoardSelectGet(request, env);
      if (method === 'POST' && pathname === '/board-select')      return handleBoardSelectPost(request, env);
      if (method === 'POST' && pathname === '/markup')            return handleMarkup(request, env);
      if (method === 'GET'  && pathname === '/manage')                        return handleManageGet(request, env);
      if (method === 'POST' && pathname === '/manage')                        return handleManagePost(request, env);
      if (method === 'GET'  && pathname === '/preview')           return handlePreview(request);
      if (method === 'POST' && pathname === '/webhooks/installation_success') return handleInstallSuccess(request, env);
      if (method === 'POST' && pathname === '/webhooks/uninstall') return handleUninstall(request, env);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error(err);
      return new Response('Internal error', { status: 500 });
    }
  },
};
