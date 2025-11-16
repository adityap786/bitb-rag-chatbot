# Greeting Audio QA Checklist

This checklist verifies the static branded MP3 greeting (`public/greeting-audio.mp3`) behaves correctly across major browsers and mobile devices.

Pre-checks
- Ensure `public/greeting-audio.mp3` exists in the project.
- Start the dev server: `npm run dev` and open the app in a browser.
- DevTools: Console and Network tabs open for diagnostics.

Test flow (common steps)
1. Clear local dev flags (optional but recommended before each browser):
   - In DevTools Console run:
     ```javascript
     localStorage.removeItem('bitb_greeted');
     localStorage.removeItem('bitb_voice_muted');
     ```
2. Open the app and click the chatbot button (user gesture required).
3. Expected: the branded greeting audio plays once.
4. Click the Mute (🔊) control — expected: audio muted (no sound on replay) and `bitb_voice_muted` set to `true` in localStorage.
5. Click Replay (🔄) — expected: audio plays (unless muted).
6. Verify network: `GET /greeting-audio.mp3` is requested on first load (or served from cache on subsequent loads).

Browser-specific checks

Chrome / Edge (Chromium)
- Desktop: Ensure greeting plays on click. Verify `mockCreatedAudios` behavior in unit tests.
- Mobile (Android Chrome): Tap the chatbot button; confirm playback. Note any autoplay policy differences.

Firefox
- Desktop & Mobile: Confirm greeting plays after click. Firefox may handle audio caching differently; check Network TTL and `304` responses.

Safari (macOS)
- Desktop: Test that greeting plays on first click. Safari may apply stricter autoplay rules; ensure user gesture used.

Safari (iOS)
- iOS Safari requires user gesture; verify tapping the widget button triggers playback. Confirm mute/unmute state persists across reloads.

Android WebView / In-app browsers
- Test in any target apps that embed your site; confirm user gesture allows playback.

Edge cases & debugging
- If greeting doesn't play at all:
  - Check the Console for errors.
  - Check Network for 404 or 403 on `/greeting-audio.mp3`.
  - Ensure the audio file isn't blocked by a service worker or CDN cache.
  - Confirm `bitb_voice_muted` is not set in localStorage.

- If a previous (male) voice plays:
  - Clear localStorage keys listed above.
  - Clear browser cache or use a versioned filename (e.g., `greeting-audio-v2.mp3`) and update `VOICE_SETUP_GUIDE.md`.

Accessibility checks
- With the greeting playing, ensure there is an aria-live indicator accessible to assistive tech (the widget includes an aria-live polite region when speaking).
- Confirm keyboard accessibility: opening via Enter/Space triggers playback.

Automation notes
- The unit tests were updated to mock `Audio` playback. If you add end-to-end tests (Playwright), ensure you grant a user gesture or simulate click before asserting audio playback.

Follow-ups (optional)
- Add playback telemetry (success/failure events) to the client to capture real-world failures.
- Provide a lightweight fallback (e.g., a visual toast) when audio fails to play.

Accepted criteria
- Greeting reliably plays on first click in Chromium, Firefox, and Safari desktop.
- Playback also works on mobile browsers when user gesture is present.
- Mute/replay controls function and persist state via localStorage.
