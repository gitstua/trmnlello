const API = 'https://api.trello.com/1';
const REQUEST_TOKEN_URL = 'https://trello.com/1/OAuthGetRequestToken';
const AUTHORIZE_URL = 'https://trello.com/1/OAuthAuthorizeToken';
const ACCESS_TOKEN_URL = 'https://trello.com/1/OAuthGetAccessToken';

// RFC 3986 percent-encode (stricter than encodeURIComponent)
function pct(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function hmacSha1Base64(keyStr, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(keyStr),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildAuthHeader(method, url, extraParams, consumerKey, consumerSecret, tokenKey = '', tokenSecret = '') {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const oauthParams = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_version: '1.0',
    ...(tokenKey ? { oauth_token: tokenKey } : {}),
    ...extraParams,
  };

  const allParams = { ...oauthParams };
  const sortedPairs = Object.entries(allParams)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${pct(k)}=${pct(v)}`)
    .join('&');

  const baseString = `${method.toUpperCase()}&${pct(url)}&${pct(sortedPairs)}`;
  const signingKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  const signature = await hmacSha1Base64(signingKey, baseString);

  oauthParams.oauth_signature = signature;

  const header = 'OAuth ' + Object.entries(oauthParams)
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(', ');

  return header;
}

function parseQS(str) {
  return Object.fromEntries(new URLSearchParams(str));
}

export async function getRequestToken(callbackUrl, env) {
  const authHeader = await buildAuthHeader(
    'POST', REQUEST_TOKEN_URL,
    { oauth_callback: callbackUrl },
    env.TRELLO_API_KEY, env.TRELLO_API_SECRET
  );

  const res = await fetch(REQUEST_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: authHeader },
  });

  if (!res.ok) throw new Error(`Request token failed: ${res.status} ${await res.text()}`);
  return parseQS(await res.text());
}

export function authorizeUrl(oauthToken, appName = 'Trmnlello - Trello private board') {
  return `${AUTHORIZE_URL}?oauth_token=${oauthToken}&name=${encodeURIComponent(appName)}&scope=read&expiration=never`;
}

export async function getAccessToken(oauthToken, oauthTokenSecret, oauthVerifier, env) {
  const authHeader = await buildAuthHeader(
    'POST', ACCESS_TOKEN_URL,
    { oauth_verifier: oauthVerifier },
    env.TRELLO_API_KEY, env.TRELLO_API_SECRET,
    oauthToken, oauthTokenSecret
  );

  const res = await fetch(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: { Authorization: authHeader },
  });

  if (!res.ok) throw new Error(`Access token failed: ${res.status} ${await res.text()}`);
  return parseQS(await res.text());
}

async function trelloGet(path, trelloToken, trelloSecret, env) {
  const url = `${API}${path}`;
  const authHeader = await buildAuthHeader(
    'GET', url, {},
    env.TRELLO_API_KEY, env.TRELLO_API_SECRET,
    trelloToken, trelloSecret
  );

  const res = await fetch(url, { headers: { Authorization: authHeader } });
  if (!res.ok) throw new Error(`Trello ${path}: ${res.status}`);
  return res.json();
}

export async function getBoards(trelloToken, trelloSecret, env) {
  return trelloGet('/members/me/boards?fields=id,name&filter=open', trelloToken, trelloSecret, env);
}

export async function getBoardData(boardId, trelloToken, trelloSecret, env) {
  const [lists, allCards] = await Promise.all([
    trelloGet(`/boards/${boardId}/lists?fields=id,name`, trelloToken, trelloSecret, env),
    trelloGet(`/boards/${boardId}/cards?fields=id,name,idList,labels,due,dueComplete,badges`, trelloToken, trelloSecret, env),
  ]);

  const byList = {};
  for (const card of allCards) {
    (byList[card.idList] ??= []).push(card);
  }

  return lists.map(list => ({ ...list, cards: byList[list.id] ?? [] }));
}
