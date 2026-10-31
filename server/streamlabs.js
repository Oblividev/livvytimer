const { io: ioClient } = require('socket.io-client');

let slSocket = null;

function connectStreamlabs(state, timer, setStatus) {
  const token = process.env.STREAMLABS_SOCKET_TOKEN;

  if (!token) {
    console.log('[Streamlabs] No socket token configured. Skipping Streamlabs connection.');
    console.log('[Streamlabs] Set STREAMLABS_SOCKET_TOKEN in .env');
    setStatus('streamlabs', 'not_configured');
    return;
  }

  setStatus('streamlabs', 'connecting');
  console.log('[Streamlabs] Connecting to Socket API...');

  slSocket = ioClient(`https://sockets.streamlabs.com?token=${token}`, {
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionAttempts: Infinity,
  });

  slSocket.on('connect', () => {
    console.log('[Streamlabs] Connected!');
    setStatus('streamlabs', 'connected');
  });

  slSocket.on('event', (eventData) => {
    if (!eventData || !eventData.type) return;

    switch (eventData.type) {
      case 'donation': {
        handleDonation(state, timer, eventData);
        break;
      }
      // Streamlabs also sends sub/bits/follow events,
      // but we get those from Twitch directly, so we skip them here
      // to avoid double-counting.
      default:
        break;
    }
  });

  slSocket.on('disconnect', (reason) => {
    console.log('[Streamlabs] Disconnected:', reason);
    setStatus('streamlabs', 'disconnected');
  });

  slSocket.on('connect_error', (err) => {
    console.error('[Streamlabs] Connection error:', err.message);
    setStatus('streamlabs', 'error');
  });
}

function handleDonation(state, timer, eventData) {
  const config = state.config;
  const adjustment = timer.getTimeAdjustment ? timer.getTimeAdjustment() : 1.0;

  if (!eventData.message || !Array.isArray(eventData.message)) return;

  for (const donation of eventData.message) {
    const amount = parseFloat(donation.amount) || 0;
    const name = donation.name || 'Anonymous';
    const currency = donation.currency || config.donationCurrency || 'USD';
    const formattedAmount = donation.formatted_amount || `${currency} ${amount.toFixed(2)}`;

    if (amount <= 0) continue;

    const rate = config.donationAmountPerMinute || 1;
    const minutes = amount / rate;

    // Apply intelligent adjustment
    const adjustedMinutes = minutes * adjustment;
    const adjustedMs = Math.round(adjustedMinutes * 60 * 1000);

    timer.addTime(
      adjustedMs,
      'Donation',
      `${name} donated ${formattedAmount}${adjustment !== 1.0 ? ` [${adjustment.toFixed(2)}x]` : ''}`,
      true
    );
    console.log(`[Streamlabs] ${name} donated ${formattedAmount} → +${adjustedMinutes.toFixed(1)}min (${adjustment.toFixed(2)}x)`);
  }
}

function disconnectStreamlabs() {
  if (slSocket) {
    slSocket.disconnect();
    slSocket = null;
  }
}

module.exports = { connectStreamlabs, disconnectStreamlabs, handleDonation };
