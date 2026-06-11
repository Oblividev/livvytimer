const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, '..', 'data', 'state.json');

const CURRENCY_SYMBOLS = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  CAD: 'C$',
  AUD: 'A$',
  JPY: '¥',
};

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
    donationAmountPerMinute: 1,
    donationCurrency: 'USD',
    eventTitle: 'Subathon',
    appTitle: 'Subathon Timer',
    theme: 'neutral',
    targetTimeMs: null,
    hardCapMs: null,
    hardCapBlockEvents: true,
  },
  eventLog: [],
};

function getCurrencySymbol(code) {
  if (!code) return '';
  const upper = code.toUpperCase();
  return CURRENCY_SYMBOLS[upper] || upper;
}

function normalizeConfig(config) {
  const input = { ...(config || {}) };

  if (input.donationAmountPerMinute === undefined && input.donationDollarsPerMinute !== undefined) {
    input.donationAmountPerMinute = input.donationDollarsPerMinute;
  }
  delete input.donationDollarsPerMinute;

  const merged = { ...DEFAULT_STATE.config, ...input };

  if (!['neutral', 'sakura'].includes(merged.theme)) {
    merged.theme = DEFAULT_STATE.config.theme;
  }

  return merged;
}

function loadState() {
  try {
    if (fs.existsSync(STATE_PATH)) {
      const raw = fs.readFileSync(STATE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        timer: { ...DEFAULT_STATE.timer, ...parsed.timer },
        config: normalizeConfig(parsed.config || {}),
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
    const trimmed = {
      ...state,
      config: normalizeConfig(state.config || {}),
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
  state.config = normalizeConfig({ ...state.config, ...newConfig });
  saveState(state);
  return state.config;
}

module.exports = {
  loadState,
  saveState,
  getConfig,
  updateConfig,
  getCurrencySymbol,
  DEFAULT_STATE,
};
