const WebSocket = require('ws');
const https = require('https');

let ws = null;
let reconnectTimeout = null;
let keepaliveTimeout = null;
let sessionId = null;

const TWITCH_WSS_URL = 'wss://eventsub.wss.twitch.tv/ws';

// ── Twitch API helper ─────────────────────────────────────────
function twitchApiRequest(method, path, body, accessToken, clientId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.twitch.tv',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Client-Id': clientId,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode, data: {} });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Subscribe to EventSub topics ──────────────────────────────
async function subscribeToEvents(sessionId, accessToken, clientId, broadcasterId) {
  const topics = [
    {
      type: 'channel.subscribe',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
    },
    {
      type: 'channel.subscription.gift',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
    },
    {
      type: 'channel.cheer',
      version: '1',
      condition: { broadcaster_user_id: broadcasterId },
    },
  ];

  for (const topic of topics) {
    try {
      const result = await twitchApiRequest(
        'POST',
        '/helix/eventsub/subscriptions',
        {
          type: topic.type,
          version: topic.version,
          condition: topic.condition,
          transport: {
            method: 'websocket',
            session_id: sessionId,
          },
        },
        accessToken,
        clientId
      );

      if (result.status === 202) {
        console.log(`[Twitch] Subscribed to ${topic.type}`);
      } else {
        console.error(`[Twitch] Failed to subscribe to ${topic.type}:`, result.status, JSON.stringify(result.data));
      }
    } catch (err) {
      console.error(`[Twitch] Error subscribing to ${topic.type}:`, err.message);
    }
  }
}

// Twitch sends tier as "1000"|"2000"|"3000" (string) or 1000|2000|3000 (number)
function subTierLevel(tier) {
  const n = Number(tier);
  if (n === 2000) return 2;
  if (n === 3000) return 3;
  return 1;
}

// ── Process incoming events ───────────────────────────────────
function handleEvent(state, timer, eventType, eventData) {
  const config = state.config;
  const adjustment = timer.getTimeAdjustment ? timer.getTimeAdjustment() : 1.0;

  switch (eventType) {
    case 'channel.subscribe': {
      // Gift subs are credited on channel.subscription.gift; recipient subscribe is duplicate
      if (eventData.is_gift) {
        console.log(`[Twitch] Skipping gift recipient subscribe (${eventData.user_name || 'Anonymous'})`);
        break;
      }

      const tierLevel = subTierLevel(eventData.tier);
      let minutes = config.tier1SubMinutes;
      if (tierLevel === 2) minutes = config.tier2SubMinutes;
      if (tierLevel === 3) minutes = config.tier3SubMinutes;

      // Apply intelligent adjustment
      const adjustedMinutes = minutes * adjustment;
      const adjustedMs = Math.round(adjustedMinutes * 60 * 1000);

      const userName = eventData.user_name || 'Anonymous';
      timer.addTime(
        adjustedMs,
        'Subscription',
        `${userName} (Tier ${tierLevel})${adjustment !== 1.0 ? ` [${adjustment.toFixed(2)}x]` : ''}`
      );
      console.log(`[Twitch] Sub from ${userName} (Tier ${tierLevel}) → +${adjustedMinutes.toFixed(1)}min (${adjustment.toFixed(2)}x)`);
      break;
    }

    case 'channel.subscription.gift': {
      const total = eventData.total || 1;
      const userName = eventData.user_name || 'Anonymous';
      const minutes = config.giftedSubMinutes * total;

      // Apply intelligent adjustment
      const adjustedMinutes = minutes * adjustment;
      const adjustedMs = Math.round(adjustedMinutes * 60 * 1000);

      timer.addTime(
        adjustedMs,
        'Gifted Subs',
        `${userName} gifted ${total} sub${total > 1 ? 's' : ''}${adjustment !== 1.0 ? ` [${adjustment.toFixed(2)}x]` : ''}`
      );
      console.log(`[Twitch] ${userName} gifted ${total} subs → +${adjustedMinutes.toFixed(1)}min (${adjustment.toFixed(2)}x)`);
      break;
    }

    case 'channel.cheer': {
      const bits = eventData.bits || 0;
      const userName = eventData.user_name || 'Anonymous';
      const minutes = bits / config.bitsPerMinute;

      if (minutes > 0) {
        // Apply intelligent adjustment
        const adjustedMinutes = minutes * adjustment;
        const adjustedMs = Math.round(adjustedMinutes * 60 * 1000);

        timer.addTime(
          adjustedMs,
          'Bits',
          `${userName} cheered ${bits} bits${adjustment !== 1.0 ? ` [${adjustment.toFixed(2)}x]` : ''}`
        );
        console.log(`[Twitch] ${userName} cheered ${bits} bits → +${adjustedMinutes.toFixed(1)}min (${adjustment.toFixed(2)}x)`);
      }
      break;
    }

    default:
      console.log(`[Twitch] Unhandled event type: ${eventType}`);
  }
}

// ── WebSocket connection ──────────────────────────────────────
function connectTwitch(state, timer, setStatus) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const accessToken = process.env.TWITCH_ACCESS_TOKEN;
  const broadcasterId = process.env.TWITCH_BROADCASTER_ID;

  if (!clientId || !accessToken || !broadcasterId) {
    console.log('[Twitch] Missing credentials. Skipping Twitch connection.');
    console.log('[Twitch] Set TWITCH_CLIENT_ID, TWITCH_ACCESS_TOKEN, and TWITCH_BROADCASTER_ID in .env');
    setStatus('twitch', 'not_configured');
    return;
  }

  setStatus('twitch', 'connecting');
  console.log('[Twitch] Connecting to EventSub WebSocket...');

  ws = new WebSocket(TWITCH_WSS_URL);

  ws.on('open', () => {
    console.log('[Twitch] WebSocket connected, waiting for welcome...');
  });

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const messageType = msg.metadata?.message_type;

    switch (messageType) {
      case 'session_welcome': {
        sessionId = msg.payload.session.id;
        const keepaliveSeconds = msg.payload.session.keepalive_timeout_seconds || 10;
        console.log(`[Twitch] Session welcome. ID: ${sessionId}, Keepalive: ${keepaliveSeconds}s`);
        setStatus('twitch', 'connected');

        // Reset keepalive watcher
        resetKeepalive(keepaliveSeconds, state, timer, setStatus);

        // Subscribe to events
        await subscribeToEvents(sessionId, accessToken, clientId, broadcasterId);
        break;
      }

      case 'session_keepalive': {
        // Reset keepalive timer
        const keepaliveSeconds = msg.payload?.session?.keepalive_timeout_seconds || 10;
        resetKeepalive(keepaliveSeconds, state, timer, setStatus);
        break;
      }

      case 'notification': {
        const eventType = msg.metadata.subscription_type;
        const eventData = msg.payload.event;
        handleEvent(state, timer, eventType, eventData);

        // Reset keepalive on notifications too
        resetKeepalive(10, state, timer, setStatus);
        break;
      }

      case 'session_reconnect': {
        const newUrl = msg.payload.session.reconnect_url;
        console.log('[Twitch] Reconnect requested. New URL:', newUrl);
        // Connect to new URL before closing old one
        const oldWs = ws;
        ws = new WebSocket(newUrl);
        ws.on('open', () => {
          oldWs.close();
        });
        setupWsListeners(state, timer, setStatus);
        break;
      }

      case 'revocation': {
        console.log('[Twitch] Subscription revoked:', msg.payload.subscription?.type);
        break;
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Twitch] WebSocket closed. Code: ${code}, Reason: ${reason || 'none'}`);
    setStatus('twitch', 'disconnected');
    sessionId = null;

    // Auto-reconnect after 5 seconds (unless intentionally closed)
    if (code !== 1000) {
      console.log('[Twitch] Reconnecting in 5 seconds...');
      reconnectTimeout = setTimeout(() => {
        connectTwitch(state, timer, setStatus);
      }, 5000);
    }
  });

  ws.on('error', (err) => {
    console.error('[Twitch] WebSocket error:', err.message);
    setStatus('twitch', 'error');
  });
}

function resetKeepalive(seconds, state, timer, setStatus) {
  if (keepaliveTimeout) clearTimeout(keepaliveTimeout);
  // If no message within keepalive + buffer, consider disconnected
  keepaliveTimeout = setTimeout(() => {
    console.log('[Twitch] Keepalive timeout. Reconnecting...');
    if (ws) ws.close();
    connectTwitch(state, timer, setStatus);
  }, (seconds + 5) * 1000);
}

function disconnectTwitch() {
  if (reconnectTimeout) clearTimeout(reconnectTimeout);
  if (keepaliveTimeout) clearTimeout(keepaliveTimeout);
  if (ws) {
    ws.close(1000, 'Shutting down');
    ws = null;
  }
  sessionId = null;
}

module.exports = { connectTwitch, disconnectTwitch, handleEvent };
