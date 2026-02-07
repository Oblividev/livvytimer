require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { loadState, saveState, updateConfig } = require('./config');
const { createTimer } = require('./timer');
const { connectTwitch, disconnectTwitch } = require('./twitch');
const { connectStreamlabs, disconnectStreamlabs } = require('./streamlabs');

const PORT = process.env.PORT || 3000;

// ── Express + Socket.IO setup ─────────────────────────────────
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// ── Load persisted state ──────────────────────────────────────
const state = loadState();
console.log('[Server] Loaded state. Timer remaining:', state.timer.remainingMs, 'ms');

// ── Timer engine ──────────────────────────────────────────────
const timer = createTimer(state, io);

// ── Static file serving ───────────────────────────────────────
app.use('/overlay', express.static(path.join(__dirname, '..', 'public', 'overlay')));
app.use('/admin', express.static(path.join(__dirname, '..', 'public', 'admin')));

// Redirect root to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// ── Connection status tracking ────────────────────────────────
const connectionStatus = {
  twitch: 'disconnected',
  streamlabs: 'disconnected',
};

function setConnectionStatus(service, status) {
  connectionStatus[service] = status;
  io.emit('connection:status', connectionStatus);
}

// ── Socket.IO client handling ─────────────────────────────────
io.on('connection', (socket) => {
  console.log('[Socket.IO] Client connected:', socket.id);

  // Send current state immediately
  socket.emit('timer:update', {
    remainingMs: state.timer.remainingMs,
    isRunning: state.timer.isRunning,
    isPaused: state.timer.isPaused,
  });
  socket.emit('config:update', state.config);
  socket.emit('target:update', { targetTimeMs: state.config.targetTimeMs });
  socket.emit('connection:status', connectionStatus);
  socket.emit('eventLog:init', (state.eventLog || []).slice(-50));

  // ── Timer controls ──────────────────────────────────────────
  socket.on('timer:start', (data) => {
    const initialMs = data && data.initialMs ? data.initialMs : null;
    timer.start(initialMs);
    console.log('[Timer] Started with', state.timer.remainingMs, 'ms');
  });

  socket.on('timer:pause', () => {
    timer.pause();
    console.log('[Timer] Paused');
  });

  socket.on('timer:resume', () => {
    timer.resume();
    console.log('[Timer] Resumed');
  });

  socket.on('timer:stop', () => {
    timer.stop();
    console.log('[Timer] Stopped');
  });

  socket.on('timer:reset', (data) => {
    const ms = data && data.ms ? data.ms : 0;
    timer.reset(ms);
    console.log('[Timer] Reset to', ms, 'ms');
  });

  socket.on('timer:addTime', (data) => {
    if (data && data.ms) {
      timer.addTime(data.ms, data.source || 'Manual', data.detail || '');
      console.log('[Timer] Manually added', data.ms, 'ms');
    }
  });

  socket.on('timer:removeTime', (data) => {
    if (data && data.ms) {
      timer.addTime(-data.ms, 'Manual Remove', data.detail || '');
      console.log('[Timer] Manually removed', data.ms, 'ms');
    }
  });

  // ── Config updates ──────────────────────────────────────────
  socket.on('config:update', (newConfig) => {
    const updated = updateConfig(state, newConfig);
    io.emit('config:update', updated);
    console.log('[Config] Updated:', updated);
  });

  // ── Target time updates ─────────────────────────────────────
  socket.on('target:set', (data) => {
    if (data && data.targetTimeMs !== undefined) {
      const targetMs = data.targetTimeMs === null || data.targetTimeMs === '' ? null : parseInt(data.targetTimeMs);
      state.config.targetTimeMs = targetMs;
      updateConfig(state, { targetTimeMs: targetMs });
      io.emit('target:update', { targetTimeMs: targetMs });
      console.log('[Target] Set to:', targetMs ? `${Math.floor(targetMs / 60000)}min` : 'disabled');
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Client disconnected:', socket.id);
  });
});

// ── Connect to external services ──────────────────────────────
connectTwitch(state, timer, setConnectionStatus);
connectStreamlabs(state, timer, setConnectionStatus);

// ── Periodic state save ───────────────────────────────────────
setInterval(() => {
  if (state.timer.isRunning) {
    saveState(state);
  }
}, 10000);

// ── Graceful shutdown ─────────────────────────────────────────
function shutdown() {
  console.log('\n[Server] Shutting down...');
  timer.stop();
  saveState(state);
  disconnectTwitch();
  disconnectStreamlabs();
  server.close(() => {
    console.log('[Server] Goodbye!');
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ── Start server ──────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n  ✿ Livvy Timer is running!`);
  console.log(`  ├─ Overlay:  http://localhost:${PORT}/overlay`);
  console.log(`  ├─ Admin:    http://localhost:${PORT}/admin`);
  console.log(`  └─ Port:     ${PORT}\n`);
});
