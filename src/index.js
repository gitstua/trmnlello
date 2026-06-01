import * as trello from './trello.js';
import * as markup from './markup.js';

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
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
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
  <title>Trmnlello — Select Board</title>
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
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">⬡</div>
    <h1>Trmnlello</h1>
    <p>Choose which Trello board to display on your TRMNL device.</p>
    <form method="POST" action="/board-select">
      <input type="hidden" name="t" value="${esc(accessToken)}">
      <select name="board_id" required>${options}</select>
      <button type="submit">Connect Board</button>
    </form>
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

  return Response.redirect(user.callback_url, 302);
}

// ─── Manage: post-install board switcher linked from TRMNL dashboard ─────────
// TRMNL opens this URL in an iframe/modal. It passes plugin_setting_uuid which
// maps to the user_uuid stored during the installation_success webhook.

async function handleManageGet(req, env) {
  const url = new URL(req.url);
  const uuid = url.searchParams.get('plugin_setting_uuid');
  if (!uuid) return new Response('Missing plugin_setting_uuid', { status: 400 });

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
  <title>Trmnlello — Manage</title>
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
    <h1>Trmnlello</h1>
    <p>Switch which Trello board appears on your device.</p>
    <form method="POST" action="/manage">
      <input type="hidden" name="uuid" value="${esc(uuid)}">
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
  const boardId = body.get('board_id');

  const user = await kvGet(env.KV, `uuid:${uuid}`);
  if (!user?.trello_token) return new Response('User not found', { status: 404 });

  const boards = await trello.getBoards(user.trello_token, user.trello_secret, env);
  const board = boards.find(b => b.id === boardId);
  if (!board) return new Response('Board not found', { status: 400 });

  const updated = { ...user, board_id: board.id, board_name: board.name };
  await kvPut(env.KV, userKey(user.access_token), updated);
  await kvPut(env.KV, `uuid:${uuid}`, updated);

  return html(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Saved</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.card{background:#fff;border-radius:12px;padding:32px;max-width:420px;width:100%;box-shadow:0 4px 20px rgba(0,0,0,.08);text-align:center}</style>
</head>
<body><div class="card">
  <div style="font-size:32px;margin-bottom:16px;">✓</div>
  <div style="font-size:16px;font-weight:600;">Board updated</div>
  <div style="font-size:13px;color:#666;margin-top:8px;">Now showing <strong>${esc(board.name)}</strong></div>
</div></body></html>`);
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
    // Extend TTL on every use — tokens inactive for 90 days expire automatically
    const touched = { ...user, last_used: new Date().toISOString() };
    await kvTouch(env.KV, userKey(bearer), touched);
    if (user.user_uuid) await kvTouch(env.KV, `uuid:${user.user_uuid}`, touched);
    return json(markup.allLayouts(user.board_name, lists));
  } catch (err) {
    const errHtml = markup.error(`Could not fetch board data: ${err.message}`);
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
  if (bearer && body.user?.uuid) {
    const user = await kvGet(env.KV, userKey(bearer)) ?? {};
    const updated = { ...user, user_uuid: body.user.uuid };
    await kvPut(env.KV, userKey(bearer), updated);
    // secondary index so /manage can look up by plugin_setting_uuid
    await kvPut(env.KV, `uuid:${body.user.uuid}`, updated);
  }
  return json({ ok: true });
}

async function handleUninstall(req, env) {
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (bearer) await env.KV.delete(userKey(bearer));
  return json({ ok: true });
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
      if (method === 'POST' && pathname === '/webhooks/installation_success') return handleInstallSuccess(request, env);
      if (method === 'POST' && pathname === '/webhooks/uninstall') return handleUninstall(request, env);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error(err);
      return new Response(`Internal error: ${err.message}`, { status: 500 });
    }
  },
};
