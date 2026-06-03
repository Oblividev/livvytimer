# Livvy Timer

**Subathon timer for ObliviosaOfficial's 5th Twitch Anniversary**

A local Node.js subathon timer with a sakura-themed OBS overlay, Twitch EventSub integration, and Streamlabs donation support.

---

## Quick Start

```
npm install
copy .env.example .env
# Fill in your credentials in .env (see setup below)
npm start
```

Then:
- **Admin Panel**: http://localhost:3000/admin
- **OBS Overlay**: http://localhost:3000/overlay

---

## Setup Guide

### 1. Create a Twitch Application

1. Go to https://dev.twitch.tv/console
2. Click **Register Your Application**
3. Fill in:
   - **Name**: Anything (e.g., "Livvy Subathon Timer")
   - **OAuth Redirect URLs**: `http://localhost:3000`
   - **Category**: Chat Bot (or Other)
4. Click **Create**
5. Copy your **Client ID** from the app details page
6. Click **New Secret** and copy your **Client Secret**

### 2. Generate a Twitch OAuth Token

You need a user access token with the right scopes. The easiest way:

1. Go to https://twitchtokengenerator.com/
2. Select **Custom Scope Token**
3. Paste your **Client ID** and **Client Secret** from step 1 (required for auto-refresh)
4. In the [Twitch Developer Console](https://dev.twitch.tv/console), add this redirect URL to your app: `https://twitchtokengenerator.com`
5. Check these scopes:
   - `channel:read:subscriptions`
   - `bits:read`
6. Click **Generate Token**
7. Authorize with the broadcaster's Twitch account
8. Copy the **Access Token** and **Refresh Token** into `.env`

The server refreshes the access token automatically when `TWITCH_REFRESH_TOKEN` is set (and writes the new tokens back to `.env`). Tokens generated without your own Client ID/Secret cannot be refreshed by this app.

### 3. Find Your Twitch Broadcaster ID

1. Go to https://www.streamweasels.com/tools/convert-twitch-username-to-user-id/
2. Enter: `ObliviosaOfficial`
3. Copy the numeric User ID

### 4. Get Streamlabs Socket Token

1. Log in to https://streamlabs.com
2. Go to **Dashboard** > **Settings** > **API Settings** > **API Tokens**
3. Copy your **Socket API Token**
4. (This is NOT the same as the API access token)

### 5. Configure .env

Copy `.env.example` to `.env` and fill in all values:

```
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
TWITCH_ACCESS_TOKEN=your_oauth_token
TWITCH_REFRESH_TOKEN=your_refresh_token
TWITCH_BROADCASTER_ID=your_broadcaster_id
STREAMLABS_SOCKET_TOKEN=your_streamlabs_socket_token
PORT=3000
```

---

## Adding to OBS

1. In OBS, add a new **Browser Source**
2. Set the URL to: `http://localhost:3000/overlay`
3. Recommended size: **500 x 200** (adjust to preference)
4. Check **"Shutdown source when not visible"** is OFF
5. The background is transparent -- it will layer over your scene

---

## Using the Admin Panel

Open http://localhost:3000/admin in your browser.

### Timer Controls
- **Set & Start**: Enter hours/minutes/seconds and click to start the countdown
- **Pause / Resume**: Temporarily halt the timer (space bar shortcut)
- **Stop**: Fully stop the timer
- **Reset**: Set the timer back to zero

### Quick Add/Remove
Add or subtract preset amounts of time with one click.

### Event Configuration
Set how much time each event type adds:
- **Tier 1/2/3 Subs**: Minutes added per subscription tier
- **Gifted Sub (each)**: Minutes per individual gifted sub
- **Bits per 1 min**: How many bits equal 1 minute of time
- **$ per 1 min**: How many dollars of donations equal 1 minute

### Event Log
Real-time feed showing all events that have added time.

### Connection Status
Shows whether Twitch and Streamlabs connections are active.

---

## Events That Add Time

| Event | Source | Default |
|-------|--------|---------|
| Tier 1 Sub | Twitch EventSub | +5 min |
| Tier 2 Sub | Twitch EventSub | +10 min |
| Tier 3 Sub | Twitch EventSub | +25 min |
| Gifted Sub | Twitch EventSub | +5 min each |
| Bits/Cheers | Twitch EventSub | +1 min per 100 bits |
| Donations | Streamlabs | +1 min per $1 |

All values are configurable from the admin panel.

---

## Troubleshooting

**Timer not showing in OBS?**
- Make sure `npm start` is running
- Check the Browser Source URL is exactly `http://localhost:3000/overlay`
- Try refreshing the browser source (right-click > Refresh)

**Twitch not connecting?**
- Check your `.env` credentials are correct
- Run `node scripts/check-twitch-auth.js` to validate the access token
- Set `TWITCH_REFRESH_TOKEN` (with your app's Client ID/Secret) so the server can renew expired tokens
- Check the console output for error messages

**Streamlabs not connecting?**
- Verify your Socket API Token (not the regular API token)
- Check https://streamlabs.com dashboard for the correct token

**Timer state lost on restart?**
- The timer auto-saves to `data/state.json` every 10 seconds while running
- It also saves on pause/stop. If the server crashes mid-tick, you may lose up to 10 seconds.
