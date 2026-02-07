/* ═══════════════════════════════════════════════════════════
   Livvy Timer Admin — Control Panel Script
   ═══════════════════════════════════════════════════════════ */

const socket = io();

// ── DOM refs ──────────────────────────────────────────────

// Timer display
const adminHours = document.getElementById('adminHours');
const adminMinutes = document.getElementById('adminMinutes');
const adminSeconds = document.getElementById('adminSeconds');
const timerDisplay = document.getElementById('timerDisplay');
const timerStatus = document.getElementById('timerStatus');

// Timer controls
const btnStart = document.getElementById('btnStart');
const btnPause = document.getElementById('btnPause');
const btnResume = document.getElementById('btnResume');
const btnStop = document.getElementById('btnStop');
const btnReset = document.getElementById('btnReset');

// Set time
const setHours = document.getElementById('setHours');
const setMinutes = document.getElementById('setMinutes');
const setSeconds = document.getElementById('setSeconds');
const btnSetTime = document.getElementById('btnSetTime');

// Config
const cfgTier1 = document.getElementById('cfgTier1');
const cfgTier2 = document.getElementById('cfgTier2');
const cfgTier3 = document.getElementById('cfgTier3');
const cfgGifted = document.getElementById('cfgGifted');
const cfgBits = document.getElementById('cfgBits');
const cfgDonation = document.getElementById('cfgDonation');
const btnSaveConfig = document.getElementById('btnSaveConfig');

// Connection status
const twitchDot = document.getElementById('twitchDot');
const twitchStatusEl = document.getElementById('twitchStatus');
const streamlabsDot = document.getElementById('streamlabsDot');
const streamlabsStatusEl = document.getElementById('streamlabsStatus');

// Event log
const eventLog = document.getElementById('eventLog');

// ── State ─────────────────────────────────────────────────
let currentState = { remainingMs: 0, isRunning: false, isPaused: false };

// ── Helpers ───────────────────────────────────────────────

function formatMs(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return {
    hours: String(h).padStart(2, '0'),
    minutes: String(m).padStart(2, '0'),
    seconds: String(s).padStart(2, '0'),
  };
}

function formatMsToReadable(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Timer display update ──────────────────────────────────

function updateTimerDisplay(data) {
  currentState = data;
  const { remainingMs, isRunning, isPaused } = data;
  const time = formatMs(remainingMs);

  adminHours.textContent = time.hours;
  adminMinutes.textContent = time.minutes;
  adminSeconds.textContent = time.seconds;

  // Critical state
  const isCritical = isRunning && !isPaused && remainingMs > 0 && remainingMs < 300000;
  timerDisplay.classList.toggle('critical', isCritical);
  timerDisplay.classList.toggle('paused', isPaused);

  // Status text
  if (!isRunning) {
    timerStatus.textContent = 'Idle';
    timerStatus.className = 'timer-status';
  } else if (isPaused) {
    timerStatus.textContent = 'Paused';
    timerStatus.className = 'timer-status paused';
  } else if (remainingMs <= 0) {
    timerStatus.textContent = 'Expired';
    timerStatus.className = 'timer-status';
  } else {
    timerStatus.textContent = 'Running';
    timerStatus.className = 'timer-status running';
  }
}

// ── Connection status ─────────────────────────────────────

function updateConnectionStatus(status) {
  // Twitch
  twitchDot.className = 'conn-dot ' + (status.twitch || 'disconnected');
  twitchStatusEl.textContent = formatStatus(status.twitch);

  // Streamlabs
  streamlabsDot.className = 'conn-dot ' + (status.streamlabs || 'disconnected');
  streamlabsStatusEl.textContent = formatStatus(status.streamlabs);
}

function formatStatus(s) {
  if (!s) return 'Unknown';
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ── Config ────────────────────────────────────────────────

function populateConfig(config) {
  cfgTier1.value = config.tier1SubMinutes ?? 5;
  cfgTier2.value = config.tier2SubMinutes ?? 10;
  cfgTier3.value = config.tier3SubMinutes ?? 25;
  cfgGifted.value = config.giftedSubMinutes ?? 5;
  cfgBits.value = config.bitsPerMinute ?? 100;
  cfgDonation.value = config.donationDollarsPerMinute ?? 1;
}

function getConfigFromInputs() {
  return {
    tier1SubMinutes: parseFloat(cfgTier1.value) || 5,
    tier2SubMinutes: parseFloat(cfgTier2.value) || 10,
    tier3SubMinutes: parseFloat(cfgTier3.value) || 25,
    giftedSubMinutes: parseFloat(cfgGifted.value) || 5,
    bitsPerMinute: parseInt(cfgBits.value) || 100,
    donationDollarsPerMinute: parseFloat(cfgDonation.value) || 1,
  };
}

// ── Event log ─────────────────────────────────────────────

function clearLogEmpty() {
  const empty = eventLog.querySelector('.log-empty');
  if (empty) empty.remove();
}

function addLogEntry(entry) {
  clearLogEmpty();

  const el = document.createElement('div');
  el.className = 'log-entry';

  const sign = entry.type === 'add' ? '+' : '-';
  const timeText = formatMsToReadable(entry.ms);

  el.innerHTML = `
    <span class="log-time-added ${entry.type}">${sign}${timeText}</span>
    <span class="log-detail">${escapeHtml(entry.detail || entry.source)}</span>
    <span class="log-source">${escapeHtml(entry.source)}</span>
    <span class="log-timestamp">${formatTimestamp(entry.timestamp)}</span>
  `;

  // Insert at top (column-reverse makes first child at bottom visually,
  // but we want newest first, so prepend)
  eventLog.prepend(el);

  // Keep max 100 entries in DOM
  while (eventLog.children.length > 100) {
    eventLog.lastChild.remove();
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Socket.IO events ──────────────────────────────────────

socket.on('timer:update', updateTimerDisplay);
socket.on('config:update', populateConfig);
socket.on('connection:status', updateConnectionStatus);

socket.on('timer:event', (eventData) => {
  addLogEntry(eventData);
});

socket.on('eventLog:init', (entries) => {
  // Populate initial log (entries come oldest-first)
  if (entries && entries.length > 0) {
    clearLogEmpty();
    // Show last 50 in reverse order
    const recent = entries.slice(-50);
    for (const entry of recent) {
      addLogEntry(entry);
    }
  }
});

socket.on('timer:expired', () => {
  addLogEntry({
    type: 'remove',
    ms: 0,
    source: 'System',
    detail: 'Timer expired!',
    timestamp: Date.now(),
  });
});

// ── Button handlers ───────────────────────────────────────

btnStart.addEventListener('click', () => {
  socket.emit('timer:start', {});
});

btnPause.addEventListener('click', () => {
  socket.emit('timer:pause');
});

btnResume.addEventListener('click', () => {
  socket.emit('timer:resume');
});

btnStop.addEventListener('click', () => {
  socket.emit('timer:stop');
});

btnReset.addEventListener('click', () => {
  if (confirm('Reset the timer to 0?')) {
    socket.emit('timer:reset', { ms: 0 });
  }
});

btnSetTime.addEventListener('click', () => {
  const h = parseInt(setHours.value) || 0;
  const m = parseInt(setMinutes.value) || 0;
  const s = parseInt(setSeconds.value) || 0;
  const ms = ((h * 3600) + (m * 60) + s) * 1000;

  if (ms <= 0) {
    alert('Please set a time greater than 0.');
    return;
  }

  socket.emit('timer:start', { initialMs: ms });
});

// Quick add/remove buttons
document.querySelectorAll('.btn-add').forEach((btn) => {
  btn.addEventListener('click', () => {
    const ms = parseInt(btn.dataset.ms);
    socket.emit('timer:addTime', { ms, source: 'Manual', detail: 'Manual add' });
  });
});

document.querySelectorAll('.btn-remove').forEach((btn) => {
  btn.addEventListener('click', () => {
    const ms = parseInt(btn.dataset.ms);
    socket.emit('timer:removeTime', { ms, source: 'Manual', detail: 'Manual remove' });
  });
});

// Save config
btnSaveConfig.addEventListener('click', () => {
  const config = getConfigFromInputs();
  socket.emit('config:update', config);
  btnSaveConfig.textContent = 'Saved!';
  btnSaveConfig.classList.add('saved');
  setTimeout(() => {
    btnSaveConfig.textContent = 'Save Configuration';
    btnSaveConfig.classList.remove('saved');
  }, 2000);
});

// ── Keyboard shortcut: Space to toggle pause ──────────────
document.addEventListener('keydown', (e) => {
  // Don't trigger if typing in an input
  if (e.target.tagName === 'INPUT') return;

  if (e.code === 'Space') {
    e.preventDefault();
    if (currentState.isRunning && !currentState.isPaused) {
      socket.emit('timer:pause');
    } else if (currentState.isRunning && currentState.isPaused) {
      socket.emit('timer:resume');
    }
  }
});
