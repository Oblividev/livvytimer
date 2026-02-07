const { saveState } = require('./config');

const TICK_INTERVAL = 100; // ms

function createTimer(state, io) {
  let tickHandle = null;
  let lastTickTime = null;

  function emitUpdate() {
    io.emit('timer:update', {
      remainingMs: state.timer.remainingMs,
      isRunning: state.timer.isRunning,
      isPaused: state.timer.isPaused,
    });
  }

  function emitEvent(eventEntry) {
    io.emit('timer:event', eventEntry);
  }

  function tick() {
    if (!state.timer.isRunning || state.timer.isPaused) return;

    const now = Date.now();
    const delta = now - lastTickTime;
    lastTickTime = now;

    state.timer.remainingMs = Math.max(0, state.timer.remainingMs - delta);
    emitUpdate();

    if (state.timer.remainingMs <= 0) {
      // Timer expired
      state.timer.remainingMs = 0;
      state.timer.isRunning = false;
      state.timer.isPaused = false;
      clearInterval(tickHandle);
      tickHandle = null;
      emitUpdate();
      io.emit('timer:expired');
      saveState(state);
      console.log('[Timer] EXPIRED!');
    }
  }

  function startTicking() {
    if (tickHandle) clearInterval(tickHandle);
    lastTickTime = Date.now();
    tickHandle = setInterval(tick, TICK_INTERVAL);
  }

  function start(initialMs) {
    if (initialMs != null && initialMs > 0) {
      state.timer.remainingMs = initialMs;
    }
    if (state.timer.remainingMs <= 0) {
      console.log('[Timer] Cannot start with 0 time. Set initial time first.');
      return;
    }
    state.timer.isRunning = true;
    state.timer.isPaused = false;
    state.timer.startedAt = Date.now();
    startTicking();
    emitUpdate();
    saveState(state);
  }

  function pause() {
    if (!state.timer.isRunning || state.timer.isPaused) return;
    state.timer.isPaused = true;
    emitUpdate();
    saveState(state);
  }

  function resume() {
    if (!state.timer.isRunning || !state.timer.isPaused) return;
    state.timer.isPaused = false;
    lastTickTime = Date.now(); // Reset so we don't count paused time
    emitUpdate();
    saveState(state);
  }

  function stop() {
    state.timer.isRunning = false;
    state.timer.isPaused = false;
    if (tickHandle) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
    emitUpdate();
    saveState(state);
  }

  function reset(ms) {
    stop();
    state.timer.remainingMs = ms || 0;
    state.timer.startedAt = null;
    emitUpdate();
    saveState(state);
  }

  function addTime(ms, source, detail) {
    const wasZero = state.timer.remainingMs <= 0;
    state.timer.remainingMs = Math.max(0, state.timer.remainingMs + ms);

    const eventEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: ms > 0 ? 'add' : 'remove',
      ms: Math.abs(ms),
      source: source || 'Unknown',
      detail: detail || '',
      timestamp: Date.now(),
    };

    // Add to event log
    if (!state.eventLog) state.eventLog = [];
    state.eventLog.push(eventEntry);

    emitUpdate();
    emitEvent(eventEntry);

    // If the timer was at zero and we added time, it might still be "running"
    // but we don't auto-restart -- the admin should press start
    return eventEntry;
  }

  // If the server restarts and the timer was running, resume ticking
  if (state.timer.isRunning && !state.timer.isPaused && state.timer.remainingMs > 0) {
    console.log('[Timer] Resuming from saved state...');
    startTicking();
  }

  return {
    start,
    pause,
    resume,
    stop,
    reset,
    addTime,
    emitUpdate,
  };
}

module.exports = { createTimer };
