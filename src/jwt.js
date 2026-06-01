// JWT verification for TRMNL manage endpoint using Web Crypto (no dependencies)
// TRMNL signs JWTs with RS256. We fetch their public keys from JWKS and cache
// them for the lifetime of the worker instance.

const JWKS_URL = 'https://trmnl.com/.well-known/jwks.json';

let jwksCache = null;

async function getJwks() {
  if (jwksCache) return jwksCache;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new Error(`Failed to fetch TRMNL JWKS: ${res.status}`);
  jwksCache = await res.json();
  return jwksCache;
}

function b64urlToBytes(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function decodePayload(b64url) {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(b64url)));
}

export async function verifyManageJwt(token, expectedUuid, clientId) {
  if (!token) throw new Error('Missing JWT');

  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed JWT');

  const [headerB64, payloadB64, sigB64] = parts;

  const header = decodePayload(headerB64);
  const payload = decodePayload(payloadB64);

  // Check expiry first — fast fail before any crypto.
  // Require exp to be present, otherwise a token with no expiry would pass.
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number') throw new Error('JWT missing exp');
  if (payload.exp < now) throw new Error('JWT expired');

  // sub should match the uuid param TRMNL passed in the URL
  if (payload.sub !== expectedUuid) throw new Error('JWT sub does not match uuid');

  // aud should match our TRMNL client ID to prevent tokens from other plugins
  if (clientId && payload.aud !== clientId) throw new Error('JWT aud does not match client ID');

  // Find the matching public key
  const jwks = await getJwks();
  const jwk = jwks.keys?.find(k => k.kid === header.kid);
  if (!jwk) throw new Error(`Unknown key id: ${header.kid}`);

  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['verify']
  );

  const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(sigB64), message);
  if (!valid) throw new Error('Invalid JWT signature');

  return payload;
}
