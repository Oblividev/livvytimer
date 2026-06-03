const fs = require('fs');
const path = require('path');
const https = require('https');

const ENV_PATH = path.join(__dirname, '..', '.env');
const REFRESH_BUFFER_SEC = 300; // refresh 5 min before expiry

let accessToken = '';
let refreshToken = '';
let refreshTimer = null;

function normalizeToken(raw) {
  return (raw || '').trim().replace(/^oauth:/i, '');
}

function postForm(url, body) {
  const params = new URLSearchParams(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(params.toString()),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
          } catch {
            resolve({ status: res.statusCode, data: {} });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(params.toString());
    req.end();
  });
}

function validateAccessToken(token) {
  return new Promise((resolve, reject) => {
    https
      .get(
        'https://id.twitch.tv/oauth2/validate',
        { headers: { Authorization: `OAuth ${token}` } },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
            } catch {
              resolve({ status: res.statusCode, data: {} });
            }
          });
        }
      )
      .on('error', reject);
  });
}

function persistTokensToEnv(updates) {
  try {
    if (!fs.existsSync(ENV_PATH)) return;
    let content = fs.readFileSync(ENV_PATH, 'utf8');
    for (const [key, value] of Object.entries(updates)) {
      const escaped = value.replace(/\n/g, '');
      const regex = new RegExp(`^${key}=.*$`, 'm');
      const line = `${key}=${escaped}`;
      if (regex.test(content)) {
        content = content.replace(regex, line);
      } else {
        content += (content.endsWith('\n') ? '' : '\n') + line + '\n';
      }
    }
    fs.writeFileSync(ENV_PATH, content, 'utf8');
    console.log('[Twitch] Saved updated token(s) to .env');
  } catch (err) {
    console.warn('[Twitch] Could not update .env:', err.message);
  }
}

function scheduleRefresh(expiresInSec) {
  if (refreshTimer) clearTimeout(refreshTimer);
  if (!refreshToken) return;

  const delaySec = Math.max(60, expiresInSec - REFRESH_BUFFER_SEC);
  refreshTimer = setTimeout(() => {
    refreshAccessToken({ reason: 'scheduled' }).catch((err) => {
      console.error('[Twitch] Scheduled token refresh failed:', err.message);
    });
  }, delaySec * 1000);

  const delayMin = Math.round(delaySec / 60);
  console.log(`[Twitch] Next token refresh in ~${delayMin} min`);
}

async function refreshAccessToken({ reason } = {}) {
  const clientId = (process.env.TWITCH_CLIENT_ID || '').trim();
  const clientSecret = (process.env.TWITCH_CLIENT_SECRET || '').trim();
  const currentRefresh = refreshToken || normalizeToken(process.env.TWITCH_REFRESH_TOKEN);

  if (!clientId || !clientSecret || !currentRefresh) {
    throw new Error('TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET, and TWITCH_REFRESH_TOKEN are required to refresh');
  }

  const label = reason ? ` (${reason})` : '';
  console.log(`[Twitch] Refreshing access token${label}...`);

  const result = await postForm('https://id.twitch.tv/oauth2/token', {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: currentRefresh,
  });

  if (result.status !== 200 || !result.data.access_token) {
    const msg = result.data.message || result.data.error || JSON.stringify(result.data);
    throw new Error(`Refresh failed (${result.status}): ${msg}`);
  }

  accessToken = result.data.access_token;
  if (result.data.refresh_token) {
    refreshToken = result.data.refresh_token;
  }

  const updates = { TWITCH_ACCESS_TOKEN: accessToken };
  if (result.data.refresh_token) {
    updates.TWITCH_REFRESH_TOKEN = refreshToken;
  }
  persistTokensToEnv(updates);

  scheduleRefresh(result.data.expires_in || 14400);
  console.log('[Twitch] Access token refreshed successfully');
  return accessToken;
}

async function ensureAccessToken() {
  const clientId = (process.env.TWITCH_CLIENT_ID || '').trim();
  const broadcasterId = (process.env.TWITCH_BROADCASTER_ID || '').trim();

  if (!clientId || !broadcasterId) {
    return false;
  }

  if (!accessToken) {
    accessToken = normalizeToken(process.env.TWITCH_ACCESS_TOKEN);
  }
  if (!refreshToken) {
    refreshToken = normalizeToken(process.env.TWITCH_REFRESH_TOKEN);
  }

  if (!accessToken && !refreshToken) {
    console.log('[Twitch] Set TWITCH_ACCESS_TOKEN or TWITCH_REFRESH_TOKEN in .env');
    return false;
  }

  if (accessToken) {
    const validation = await validateAccessToken(accessToken);
    if (validation.status === 200) {
      const expiresIn = validation.data.expires_in || 0;
      if (refreshToken && expiresIn > 0 && expiresIn <= REFRESH_BUFFER_SEC) {
        await refreshAccessToken({ reason: 'expiring soon' });
      } else if (refreshToken && expiresIn > REFRESH_BUFFER_SEC) {
        scheduleRefresh(expiresIn);
      }
      return true;
    }
    console.log('[Twitch] Access token invalid or expired');
  }

  if (refreshToken) {
    try {
      await refreshAccessToken({ reason: 'startup' });
      return true;
    } catch (err) {
      console.error('[Twitch]', err.message);
      return false;
    }
  }

  console.log('[Twitch] No valid access token and no refresh token configured');
  return false;
}

function getAccessToken() {
  return accessToken || normalizeToken(process.env.TWITCH_ACCESS_TOKEN);
}

function hasRefreshConfigured() {
  return Boolean(refreshToken || normalizeToken(process.env.TWITCH_REFRESH_TOKEN));
}

async function initTwitchAuth() {
  return ensureAccessToken();
}

function stopTwitchAuth() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

module.exports = {
  initTwitchAuth,
  ensureAccessToken,
  refreshAccessToken,
  getAccessToken,
  hasRefreshConfigured,
  stopTwitchAuth,
};
