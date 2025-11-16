export const TELEMETRY_OPT_OUT_KEY = 'bitb_voice_telemetry_optout';

export function isTelemetryEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const val = localStorage.getItem(TELEMETRY_OPT_OUT_KEY);
    return val !== 'true';
  } catch (e) {
    // If any error reading storage, default to enabled
    return true;
  }
}

export function sendVoiceEvent(name: string, payload: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;

  try {
    if (!isTelemetryEnabled()) return;

    const event = { event: 'bitb_voice', name, timestamp: Date.now(), ...payload };

    // Console logging for quick debugging (non-blocking)
    // eslint-disable-next-line no-console
    console.info('[bitb-voice]', event);

    // Optional GTM/dataLayer integration if present
    try {
      const anyWindow = window as any;
      if (anyWindow?.dataLayer && typeof anyWindow.dataLayer.push === 'function') {
        try { anyWindow.dataLayer.push(event); } catch {}
      }
    } catch {}

    // Dispatch a CustomEvent so integrations or tests can listen
    try {
      window.dispatchEvent(new CustomEvent('bitb-voice-event', { detail: event }));
    } catch {}

    // Optional: send to a configured telemetry endpoint (NEXT_PUBLIC_GREETING_TELEMETRY_URL)
    // Use navigator.sendBeacon if available for non-blocking delivery, otherwise fetch.
    try {
      const url = (typeof process !== 'undefined')
        ? (process.env.NEXT_PUBLIC_GREETING_TELEMETRY_URL || process.env.NEXT_PUBLIC_TELEMETRY_URL)
        : undefined;

      if (url) {
        const body = JSON.stringify(event);
        if (typeof navigator !== 'undefined' && typeof (navigator as any).sendBeacon === 'function') {
          try { (navigator as any).sendBeacon(url, body); } catch {}
        } else {
          try { fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }); } catch {}
        }
      }
    } catch {}
  } catch (e) {
    // eslint-disable-next-line no-console
    console.debug('[bitb-voice] telemetry error', e);
  }
}
