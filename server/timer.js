const { saveState } = require('./config');

const TICK_INTERVAL = 100; // ms

/**
 * Calculate intelligent time adjustment multiplier based on target time.
 * Returns a multiplier that adjusts time additions to help reach the target.
 * 
 * @param {number} currentMs - Current timer remaining time in milliseconds
 * @param {number|null} targetMs - Target time in milliseconds (null = disabled)
 * @returns {number} Multiplier to apply to time additions (1.0 = no change)
 */
function calculateTimeAdjustment(currentMs, targetMs) {
  // If no target is set, no adjustment
  if (!targetMs || targetMs <= 0) {
    return 1.0;
  }

  const progress = currentMs / targetMs;

  // Far below target (< 40%): Boost additions significantly
  if (progress < 0.4) {
    // Linear scale from 2.0x at 0% to 1.2x at 40%
    return 2.0 - (progress / 0.4) * 0.8;
  }

  // Approaching target (40-80%): Gradual reduction
  if (progress < 0.8) {
    // Linear scale from 1.2x at 40% to 1.0x at 80%
    return 1.2 - ((progress - 0.4) / 0.4) * 0.2;
  }

  // Close to target (80-100%): Reduce additions
  if (progress < 1.0) {
    // Linear scale from 1.0x at 80% to 0.5x at 100%
    return 1.0 - ((progress - 0.8) / 0.2) * 0.5;
  }

  // At or above target (>= 100%): Significantly reduce additions
  // Scale down more aggressively the further above target
  if (progress < 1.5) {
    // Linear scale from 0.5x at 100% to 0.25x at 150%
    return 0.5 - ((progress - 1.0) / 0.5) * 0.25;
  }

  // Very far above target: Minimal additions
  return 0.25;
}

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

  function addTime(ms, source, detail, fromEvent = false) {
    const wasZero = state.timer.remainingMs <= 0;
    const oldTime = state.timer.remainingMs;
    const hardCap = state.config.hardCapMs;

    // Block event top-ups when already at the hard cap
    if (
      fromEvent &&
      ms > 0 &&
      state.config.hardCapBlockEvents &&
      hardCap &&
      hardCap > 0 &&
      oldTime >= hardCap
    ) {
      console.log(`[Timer] Blocked ${source} add — hard cap reached`);
      return null;
    }

    let newTime = oldTime + ms;

    // Enforce hard cap if set
    let wasCapped = false;
    if (hardCap && hardCap > 0 && newTime > hardCap) {
      newTime = hardCap;
      wasCapped = true;
      // If we hit the cap, add a note to the detail
      if (ms > 0 && detail && !detail.includes('[Capped]')) {
        detail += ' [Capped]';
      }
    }
    
    state.timer.remainingMs = Math.max(0, newTime);
    
    // Calculate actual time added (may be less than requested if capped)
    const actualMsAdded = state.timer.remainingMs - oldTime;
    const eventMs = Math.abs(actualMsAdded);

    const eventEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type: ms > 0 ? 'add' : 'remove',
      ms: eventMs,
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

  /**
   * Get the current time adjustment multiplier based on target time.
   * This can be used by event handlers to adjust time additions.
   */
  function getTimeAdjustment() {
    return calculateTimeAdjustment(state.timer.remainingMs, state.config.targetTimeMs);
  }

  return {
    start,
    pause,
    resume,
    stop,
    reset,
    addTime,
    emitUpdate,
    getTimeAdjustment,
  };
}

module.exports = { createTimer, calculateTimeAdjustment };
