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

// Target time
const targetHours = document.getElementById('targetHours');
const targetMinutes = document.getElementById('targetMinutes');
const targetSeconds = document.getElementById('targetSeconds');
const btnSetTarget = document.getElementById('btnSetTarget');
const btnClearTarget = document.getElementById('btnClearTarget');
const targetStatus = document.getElementById('targetStatus');
const targetDisplay = document.getElementById('targetDisplay');
const targetProgress = document.getElementById('targetProgress');
const targetAdjustment = document.getElementById('targetAdjustment');

// Hard cap
const capHours = document.getElementById('capHours');
const capMinutes = document.getElementById('capMinutes');
const capSeconds = document.getElementById('capSeconds');
const btnSetCap = document.getElementById('btnSetCap');
const btnClearCap = document.getElementById('btnClearCap');
const capStatus = document.getElementById('capStatus');
const capDisplay = document.getElementById('capDisplay');
const capStatusText = document.getElementById('capStatusText');
const capBlockEvents = document.getElementById('capBlockEvents');

// Connection status
const twitchDot = document.getElementById('twitchDot');
const twitchStatusEl = document.getElementById('twitchStatus');
const streamlabsDot = document.getElementById('streamlabsDot');
const streamlabsStatusEl = document.getElementById('streamlabsStatus');

// Event log
const eventLog = document.getElementById('eventLog');
const btnClearLog = document.getElementById('btnClearLog');

// ── State ─────────────────────────────────────────────────
let currentState = { remainingMs: 0, isRunning: false, isPaused: false };
let targetTimeMs = null;
let hardCapMs = null;

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

  // Update target status display
  updateTargetStatus();
  updateCapStatus();
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

// ── Target Time ────────────────────────────────────────────────

function calculateTimeAdjustment(currentMs, targetMs) {
  if (!targetMs || targetMs <= 0) return 1.0;
  const progress = currentMs / targetMs;
  if (progress < 0.4) return 2.0 - (progress / 0.4) * 0.8;
  if (progress < 0.8) return 1.2 - ((progress - 0.4) / 0.4) * 0.2;
  if (progress < 1.0) return 1.0 - ((progress - 0.8) / 0.2) * 0.5;
  if (progress < 1.5) return 0.5 - ((progress - 1.0) / 0.5) * 0.25;
  return 0.25;
}

function updateTargetStatus() {
  if (!targetTimeMs || targetTimeMs <= 0) {
    targetStatus.style.display = 'none';
    return;
  }

  targetStatus.style.display = 'block';

  // Display target time
  const targetTime = formatMs(targetTimeMs);
  targetDisplay.textContent = `${targetTime.hours}:${targetTime.minutes}:${targetTime.seconds}`;

  // Calculate and display progress
  const currentMs = currentState.remainingMs;
  const progress = Math.min(100, (currentMs / targetTimeMs) * 100);
  targetProgress.textContent = `${progress.toFixed(1)}%`;

  // Calculate and display adjustment multiplier
  const adjustment = calculateTimeAdjustment(currentMs, targetTimeMs);
  targetAdjustment.textContent = `${adjustment.toFixed(2)}x`;
  
  // Color code the adjustment
  if (adjustment > 1.0) {
    targetAdjustment.className = 'target-value boost';
  } else if (adjustment < 1.0) {
    targetAdjustment.className = 'target-value reduce';
  } else {
    targetAdjustment.className = 'target-value';
  }
}

function updateCapStatus() {
  if (!hardCapMs || hardCapMs <= 0) {
    capStatus.style.display = 'none';
    return;
  }

  capStatus.style.display = 'block';

  // Display cap time
  const capTime = formatMs(hardCapMs);
  capDisplay.textContent = `${capTime.hours}:${capTime.minutes}:${capTime.seconds}`;

  // Check if timer is at or near cap
  const currentMs = currentState.remainingMs;
  const remainingToCap = hardCapMs - currentMs;
  const percentToCap = (currentMs / hardCapMs) * 100;

  if (remainingToCap <= 0) {
    capStatusText.textContent = 'AT CAP';
    capStatusText.className = 'target-value reduce';
  } else if (remainingToCap < 60000) { // Less than 1 minute
    capStatusText.textContent = 'Near Cap';
    capStatusText.className = 'target-value reduce';
  } else if (percentToCap >= 90) {
    capStatusText.textContent = `${percentToCap.toFixed(0)}% Full`;
    capStatusText.className = 'target-value reduce';
  } else {
    capStatusText.textContent = 'Active';
    capStatusText.className = 'target-value';
  }
}

// ── Event log ─────────────────────────────────────────────

function clearLogEmpty() {
  const empty = eventLog.querySelector('.log-empty');
  if (empty) empty.remove();
}

function resetEventLogUI() {
  eventLog.querySelectorAll('.log-entry').forEach((el) => el.remove());
  if (!eventLog.querySelector('.log-empty')) {
    const empty = document.createElement('div');
    empty.className = 'log-empty';
    empty.textContent = 'No events yet. Events will appear here in real time.';
    eventLog.appendChild(empty);
  }
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

socket.on('target:update', (data) => {
  targetTimeMs = data.targetTimeMs || null;
  if (targetTimeMs) {
    const time = formatMs(targetTimeMs);
    targetHours.value = parseInt(time.hours);
    targetMinutes.value = parseInt(time.minutes);
    targetSeconds.value = parseInt(time.seconds);
  } else {
    targetHours.value = 0;
    targetMinutes.value = 0;
    targetSeconds.value = 0;
  }
  updateTargetStatus();
});

socket.on('hardcap:update', (data) => {
  hardCapMs = data.hardCapMs || null;
  capBlockEvents.checked = data.hardCapBlockEvents !== false;
  if (hardCapMs) {
    const time = formatMs(hardCapMs);
    capHours.value = parseInt(time.hours);
    capMinutes.value = parseInt(time.minutes);
    capSeconds.value = parseInt(time.seconds);
  } else {
    capHours.value = 0;
    capMinutes.value = 0;
    capSeconds.value = 0;
  }
  updateCapStatus();
});

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

socket.on('eventLog:cleared', resetEventLogUI);

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

btnClearLog.addEventListener('click', () => {
  socket.emit('eventLog:clear');
});

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

// Target time handlers
btnSetTarget.addEventListener('click', () => {
  const h = parseInt(targetHours.value) || 0;
  const m = parseInt(targetMinutes.value) || 0;
  const s = parseInt(targetSeconds.value) || 0;
  const ms = ((h * 3600) + (m * 60) + s) * 1000;

  if (ms <= 0) {
    alert('Please set a target time greater than 0.');
    return;
  }

  socket.emit('target:set', { targetTimeMs: ms });
});

btnClearTarget.addEventListener('click', () => {
  socket.emit('target:set', { targetTimeMs: null });
});

// Hard cap handlers
btnSetCap.addEventListener('click', () => {
  const h = parseInt(capHours.value) || 0;
  const m = parseInt(capMinutes.value) || 0;
  const s = parseInt(capSeconds.value) || 0;
  const ms = ((h * 3600) + (m * 60) + s) * 1000;

  if (ms <= 0) {
    alert('Please set a hard cap greater than 0.');
    return;
  }

  socket.emit('hardcap:set', { hardCapMs: ms });
});

btnClearCap.addEventListener('click', () => {
  socket.emit('hardcap:set', { hardCapMs: null });
});

capBlockEvents.addEventListener('change', () => {
  socket.emit('hardcap:set', { hardCapBlockEvents: capBlockEvents.checked });
});

// ── Test Events ────────────────────────────────────────────────

// Get test event elements
const testTier1 = document.getElementById('testTier1');
const testTier2 = document.getElementById('testTier2');
const testTier3 = document.getElementById('testTier3');
const testGifted = document.getElementById('testGifted');
const testGiftedCount = document.getElementById('testGiftedCount');
const testBits = document.getElementById('testBits');
const testBitsCount = document.getElementById('testBitsCount');
const testDonation = document.getElementById('testDonation');
const testDonationAmount = document.getElementById('testDonationAmount');
const testCustomUsername = document.getElementById('testCustomUsername');

function getTestUsername() {
  const username = testCustomUsername.value.trim();
  return username || 'TestUser';
}

testTier1.addEventListener('click', () => {
  socket.emit('test:subscription', { tier: '1000', userName: getTestUsername() });
});

testTier2.addEventListener('click', () => {
  socket.emit('test:subscription', { tier: '2000', userName: getTestUsername() });
});

testTier3.addEventListener('click', () => {
  socket.emit('test:subscription', { tier: '3000', userName: getTestUsername() });
});

testGifted.addEventListener('click', () => {
  const count = parseInt(testGiftedCount.value) || 1;
  socket.emit('test:giftedSubs', { total: count, userName: getTestUsername() });
});

testBits.addEventListener('click', () => {
  const bits = parseInt(testBitsCount.value) || 100;
  socket.emit('test:bits', { bits: bits, userName: getTestUsername() });
});

testDonation.addEventListener('click', () => {
  const amount = parseFloat(testDonationAmount.value) || 1.0;
  socket.emit('test:donation', { amount: amount, userName: getTestUsername() });
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
