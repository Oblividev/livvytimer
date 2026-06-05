const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', 'data', 'state.json');

const DEFAULT_STATE = {
  timer: {
    remainingMs: 0,
    isRunning: false,
    isPaused: false,
    startedAt: null,
  },
  config: {
    tier1SubMinutes: 5,
    tier2SubMinutes: 10,
    tier3SubMinutes: 25,
    giftedSubMinutes: 5,
    bitsPerMinute: 100,
    donationDollarsPerMinute: 1,
    targetTimeMs: null, // Target time in milliseconds (null = disabled)
    hardCapMs: null, // Hard cap maximum time in milliseconds (null = disabled)
    hardCapBlockEvents: true, // When at cap, block event-based time additions
  },
  eventLog: [],
};

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      // Merge with defaults so new fields are always present
      return {
        timer: { ...DEFAULT_STATE.timer, ...parsed.timer },
        config: { ...DEFAULT_STATE.config, ...parsed.config },
        eventLog: parsed.eventLog || [],
      };
    }
  } catch (err) {
    console.error('[Config] Failed to load state, using defaults:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState(state) {
  try {
    const dir = path.dirname(STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Keep only the last 200 events to prevent unbounded growth
    const trimmed = {
      ...state,
      eventLog: (state.eventLog || []).slice(-200),
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Config] Failed to save state:', err.message);
  }
}

function getConfig(state) {
  return state.config;
}

function updateConfig(state, newConfig) {
  state.config = { ...state.config, ...newConfig };
  saveState(state);
  return state.config;
}

module.exports = {
  loadState,
  saveState,
  getConfig,
  updateConfig,
  DEFAULT_STATE,
};
