/* ═══════════════════════════════════════════════════════════
   Subathon Timer — Overlay Script
   ═══════════════════════════════════════════════════════════ */

const socket = io();

// ── DOM refs ──────────────────────────────────────────────
const hoursEl = document.getElementById('hours');
const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
const timerCard = document.getElementById('timerCard');
const pausedOverlay = document.getElementById('pausedOverlay');
const petalsContainer = document.getElementById('petalsContainer');
const burstContainer = document.getElementById('burstContainer');
const eventToast = document.getElementById('eventToast');
const eventAmount = document.getElementById('eventAmount');
const eventLabel = document.getElementById('eventLabel');
const eventBadge = document.getElementById('eventBadge');
const eventTitleEl = document.getElementById('eventTitle');

// ── State ─────────────────────────────────────────────────
let currentState = { remainingMs: 0, isRunning: false, isPaused: false };
let currentTheme = 'neutral';
let toastTimeout = null;
let ambientPetalsStarted = false;

// ── Petal SVG template ────────────────────────────────────
function createPetalSVG() {
  const colors = [
    { fill: '#7EC8E3', opacity: 0.7 },
    { fill: '#A8E4F0', opacity: 0.6 },
    { fill: '#FFB7C5', opacity: 0.65 },
    { fill: '#C5B8D9', opacity: 0.55 },
    { fill: '#FFD0DC', opacity: 0.6 },
  ];
  const c = colors[Math.floor(Math.random() * colors.length)];
  return `<svg viewBox="0 0 12 10" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="6" cy="5" rx="5.5" ry="4" fill="${c.fill}" opacity="${c.opacity}" transform="rotate(${Math.random() * 30 - 15}, 6, 5)"/>
    <ellipse cx="5" cy="4.5" rx="2.5" ry="1.8" fill="white" opacity="0.2" transform="rotate(-10, 5, 4.5)"/>
  </svg>`;
}

function clearPetals() {
  petalsContainer.innerHTML = '';
  burstContainer.innerHTML = '';
  ambientPetalsStarted = false;
}

// ── Ambient petals ────────────────────────────────────────
function spawnAmbientPetals() {
  if (ambientPetalsStarted || currentTheme !== 'sakura') return;
  ambientPetalsStarted = true;
  petalsContainer.innerHTML = '';

  const count = 10;
  for (let i = 0; i < count; i++) {
    const petal = document.createElement('div');
    petal.className = 'petal';
    petal.innerHTML = createPetalSVG();

    const size = 8 + Math.random() * 10;
    petal.style.width = size + 'px';
    petal.style.height = (size * 0.8) + 'px';
    petal.style.left = (Math.random() * 100) + '%';
    petal.style.top = '-20px';

    const duration = 7 + Math.random() * 8;
    const delay = Math.random() * duration;
    const driftX = (Math.random() * 80 - 40);
    const driftRot = 180 + Math.random() * 360;

    petal.style.setProperty('--drift-duration', duration + 's');
    petal.style.setProperty('--drift-delay', delay + 's');
    petal.style.setProperty('--drift-x', driftX + 'px');
    petal.style.setProperty('--drift-rot', driftRot + 'deg');

    petal.classList.add('drifting');
    petalsContainer.appendChild(petal);
  }
}

// ── Burst petals (event triggered) ────────────────────────
function triggerBurst() {
  if (currentTheme !== 'sakura') return;

  const count = 18;
  for (let i = 0; i < count; i++) {
    const petal = document.createElement('div');
    petal.className = 'burst-petal';
    petal.innerHTML = createPetalSVG();

    const size = 10 + Math.random() * 12;
    petal.style.width = size + 'px';
    petal.style.height = (size * 0.85) + 'px';
    petal.style.left = (10 + Math.random() * 80) + '%';

    const duration = 2 + Math.random() * 2.5;
    const delay = Math.random() * 0.8;
    const burstX = (Math.random() * 120 - 60);
    const burstRot = 360 + Math.random() * 540;

    petal.style.setProperty('--burst-duration', duration + 's');
    petal.style.setProperty('--burst-delay', delay + 's');
    petal.style.setProperty('--burst-x', burstX + 'px');
    petal.style.setProperty('--burst-rot', burstRot + 'deg');

    petal.classList.add('falling');
    burstContainer.appendChild(petal);

    setTimeout(() => {
      petal.remove();
    }, (duration + delay + 0.5) * 1000);
  }
}

// ── Display config ────────────────────────────────────────
function applyDisplayConfig(config) {
  const theme = config.theme === 'sakura' ? 'sakura' : 'neutral';
  const eventTitle = (config.eventTitle || '').trim();
  const appTitle = config.appTitle || 'Subathon Timer';

  document.documentElement.dataset.theme = theme;
  document.title = `${appTitle} - Overlay`;

  eventTitleEl.textContent = eventTitle || 'Subathon';
  eventBadge.classList.toggle('hidden', !eventTitle);

  if (theme !== currentTheme) {
    currentTheme = theme;
    if (theme === 'sakura') {
      spawnAmbientPetals();
    } else {
      clearPetals();
    }
  } else if (theme === 'sakura' && !ambientPetalsStarted) {
    spawnAmbientPetals();
  }
}

// ── Format time ───────────────────────────────────────────
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
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `+${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `+${m}:${String(s).padStart(2, '0')}`;
}

// ── Update display ────────────────────────────────────────
function updateDisplay(data) {
  currentState = data;
  const { remainingMs, isRunning, isPaused } = data;
  const time = formatMs(remainingMs);

  hoursEl.textContent = time.hours;
  minutesEl.textContent = time.minutes;
  secondsEl.textContent = time.seconds;

  timerCard.classList.toggle('critical', isRunning && !isPaused && remainingMs > 0 && remainingMs < 300000);
  timerCard.classList.toggle('expired', isRunning && remainingMs <= 0);
  timerCard.classList.toggle('idle', !isRunning);

  pausedOverlay.classList.toggle('visible', isPaused);
}

// ── Show event toast ──────────────────────────────────────
function showEventToast(eventData) {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    eventToast.classList.remove('show');
  }

  const timeStr = eventData.type === 'add'
    ? formatMsToReadable(eventData.ms)
    : `-${formatMsToReadable(eventData.ms).slice(1)}`;

  eventAmount.textContent = timeStr;

  let label = eventData.source || '';
  if (eventData.detail) label = eventData.detail;
  eventLabel.textContent = label;

  triggerBurst();

  void eventToast.offsetWidth;
  eventToast.classList.add('show');

  toastTimeout = setTimeout(() => {
    eventToast.classList.remove('show');
  }, 2600);
}

// ── Socket.IO events ──────────────────────────────────────
socket.on('timer:update', updateDisplay);
socket.on('config:update', applyDisplayConfig);

socket.on('timer:event', (eventData) => {
  if (eventData.type === 'add') {
    showEventToast(eventData);
  }
});

socket.on('timer:expired', () => {
  timerCard.classList.add('expired');
  triggerBurst();
});

socket.on('connect', () => {
  console.log('[Overlay] Connected to server');
});

socket.on('disconnect', () => {
  console.log('[Overlay] Disconnected from server');
});
