import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendVoiceEvent, TELEMETRY_OPT_OUT_KEY } from '../src/lib/telemetry/greetingTelemetry';

// The test runner runs in a Node environment by default. Provide a tiny
// jsdom-like shim so tests that reference `window` / `localStorage` work
// without changing global test config.
const globalAny = globalThis as any;
if (!globalAny.window) {
  globalAny.window = {};
}
if (!globalAny.localStorage) {
  const _store: Record<string, string> = {};
  globalAny.localStorage = {
    getItem: (k: string) => (_store[k] ?? null),
    setItem: (k: string, v: string) => { _store[k] = String(v); },
    removeItem: (k: string) => { delete _store[k]; },
    clear: () => { for (const k in _store) delete _store[k]; },
  };
}

// Minimal CustomEvent & EventTarget polyfill for the test environment.
if (typeof globalAny.CustomEvent === 'undefined') {
  globalAny.CustomEvent = function (type: string, params?: any) {
    params = params || { detail: null };
    return { type, detail: params.detail } as any;
  } as any;
}

if (!globalAny.window.addEventListener) {
  const _listeners: Record<string, Array<Function>> = {};
  globalAny.window.addEventListener = (type: string, cb: any) => {
    _listeners[type] = _listeners[type] || [];
    _listeners[type].push(cb);
  };
  globalAny.window.removeEventListener = (type: string, cb: any) => {
    if (!_listeners[type]) return;
    _listeners[type] = _listeners[type].filter((fn: any) => fn !== cb);
  };
  globalAny.window.dispatchEvent = (ev: any) => {
    const handlers = _listeners[ev.type] || [];
    handlers.forEach((fn) => { try { fn(ev); } catch {} });
    return true;
  };
}

beforeEach(() => {
  // Clear any stored opt-out before each test
  try { (localStorage as Storage).clear(); } catch {}
  vi.clearAllMocks();
});

describe('greeting telemetry adapter', () => {
  it('emits console, dataLayer and CustomEvent when enabled', () => {
    // Arrange
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const dataLayerPush = vi.fn();
    (window as any).dataLayer = { push: dataLayerPush };

    const listener = vi.fn();
    window.addEventListener('bitb-voice-event', (e: Event) => {
      // CustomEvent detail is in (e as CustomEvent).detail
      listener((e as CustomEvent).detail);
    });

    // Act
    sendVoiceEvent('play_attempt', { trigger: 'open' });

    // Assert
    expect(info).toHaveBeenCalled();
    expect(dataLayerPush).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
    const detail = listener.mock.calls[0][0];
    expect(detail).toHaveProperty('name', 'play_attempt');
    expect(detail).toHaveProperty('trigger', 'open');
  });

  it('respects localStorage opt-out and does not emit events', () => {
    // Arrange: opt out
    localStorage.setItem(TELEMETRY_OPT_OUT_KEY, 'true');

    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const dataLayerPush = vi.fn();
    (window as any).dataLayer = { push: dataLayerPush };

    const listener = vi.fn();
    window.addEventListener('bitb-voice-event', (e: Event) => {
      listener((e as CustomEvent).detail);
    });

    // Act
    sendVoiceEvent('play_attempt', { trigger: 'open' });

    // Assert
    expect(info).not.toHaveBeenCalled();
    expect(dataLayerPush).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });
});
