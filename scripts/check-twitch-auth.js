#!/usr/bin/env node
/**
 * Diagnose Twitch EventSub auth issues (does not print secrets).
 */
require('dotenv').config();
const https = require('https');

const clientId = (process.env.TWITCH_CLIENT_ID || '').trim();
const clientSecret = (process.env.TWITCH_CLIENT_SECRET || '').trim();
const accessToken = (process.env.TWITCH_ACCESS_TOKEN || '').trim().replace(/^oauth:/i, '');
const refreshToken = (process.env.TWITCH_REFRESH_TOKEN || '').trim();
const broadcasterId = (process.env.TWITCH_BROADCASTER_ID || '').trim();

const REQUIRED_SCOPES = ['channel:read:subscriptions', 'bits:read'];

function get(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('\n  Twitch auth diagnostic\n');

  if (!clientId || !broadcasterId) {
    console.log('  Missing TWITCH_CLIENT_ID or TWITCH_BROADCASTER_ID in .env\n');
    process.exit(1);
  }

  if (!accessToken && !refreshToken) {
    console.log('  Missing TWITCH_ACCESS_TOKEN or TWITCH_REFRESH_TOKEN in .env\n');
    process.exit(1);
  }

  if (accessToken && process.env.TWITCH_ACCESS_TOKEN?.includes('oauth:')) {
    console.log('  WARN: Token has "oauth:" prefix — remove it from .env (only the raw token)\n');
  }
  if (accessToken && /\s/.test(process.env.TWITCH_ACCESS_TOKEN)) {
    console.log('  WARN: Token contains whitespace — check for trailing spaces/newlines\n');
  }

  if (!accessToken) {
    console.log('  Access token not set; refresh token is configured.');
    console.log('  → Start the server — it will obtain an access token on startup.\n');
    process.exit(0);
  }

  const validation = await get('https://id.twitch.tv/oauth2/validate', {
    Authorization: `OAuth ${accessToken}`,
  });

  if (validation.status !== 200) {
    console.log('  Token validation FAILED:', validation.status, validation.data.message || validation.data);
    console.log(`  Refresh token:   ${refreshToken ? 'set in .env' : 'not set'}`);
    if (refreshToken && clientSecret) {
      console.log('  → Access token expired; server will refresh on startup.\n');
      process.exit(0);
    }
    console.log('  → Regenerate token and update TWITCH_ACCESS_TOKEN (and TWITCH_REFRESH_TOKEN)\n');
    process.exit(1);
  }

  const v = validation.data;
  const tokenUserId = String(v.user_id);
  const tokenClientId = v.client_id;
  const scopes = v.scopes || [];
  const expiresHours = Math.round(v.expires_in / 3600);

  console.log(`  Token login:     ${v.login}`);
  console.log(`  Token user ID:   ${tokenUserId}`);
  console.log(`  Broadcaster ID:  ${broadcasterId}`);
  console.log(`  Client ID match: ${tokenClientId === clientId ? 'yes' : 'NO — token is for a different app'}`);
  console.log(`  Broadcaster match: ${tokenUserId === broadcasterId ? 'yes' : 'NO — token must be from the channel owner'}`);
  if (validation.status === 200) {
    console.log(`  Expires in:      ~${expiresHours} hours`);
  }
  console.log(`  Refresh token:   ${refreshToken ? 'set in .env' : 'not set'}`);
  console.log(`  Scopes:          ${scopes.length ? scopes.join(', ') : '(none)'}`);

  const missingScopes = REQUIRED_SCOPES.filter((s) => !scopes.includes(s));
  if (missingScopes.length) {
    console.log(`  Missing scopes:  ${missingScopes.join(', ')}`);
  } else {
    console.log('  Required scopes: present');
  }

  // Resolve broadcaster ID from login for cross-check
  const users = await get(
    `https://api.twitch.tv/helix/users?id=${encodeURIComponent(broadcasterId)}`,
    { Authorization: `Bearer ${accessToken}`, 'Client-Id': clientId }
  );
  if (users.status === 200 && users.data.data?.[0]) {
    console.log(`  Broadcaster ID resolves to: ${users.data.data[0].login}`);
  }

  console.log('\n  EventSub 403 "missing proper authorization" usually means:');
  if (tokenUserId !== broadcasterId) {
    console.log('  → FIX: Re-generate token while logged in AS the broadcaster account.');
    console.log(`     Your token is for "${v.login}" but TWITCH_BROADCASTER_ID is a different user.`);
  } else if (tokenClientId !== clientId) {
    console.log('  → FIX: TWITCH_CLIENT_ID must match the app used to generate the token.');
  } else if (missingScopes.length) {
    console.log('  → FIX: Re-generate token with channel:read:subscriptions and bits:read.');
  } else {
    console.log('  → Token looks correct. If 403 persists, revoke app access at');
    console.log('    https://www.twitch.tv/settings/connections and re-authorize.');
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
