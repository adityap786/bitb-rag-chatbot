# Voice Greeting Setup Guide (static MP3)

## TL;DR
This project now uses a static, branded MP3 for the assistant greeting. To change or update the voice, place your audio file at `public/greeting-audio.mp3` (exact filename). The widget will play that file on the user's first click/open gesture and provides mute and replay controls.

This approach avoids paid server TTS usage and guarantees the same voice across all browsers and devices.

---

## Quick Start — static MP3 (recommended)

1. Place your branded MP3 into the project's `public/` folder and name it exactly `greeting-audio.mp3`.
   - Example path (Windows): `W:\BIT B RAG CAHTBOT\public\greeting-audio.mp3`

2. Start the dev server:
```powershell
npm run dev
```

3. Open the app in a browser and click the chatbot button (Brain icon). The greeting will play (user gesture required by browsers).

Notes:
- Overwriting `public/greeting-audio.mp3` updates the greeting for new page loads. Browsers may cache the file — consider versioned filenames (e.g. `greeting-audio-v2.mp3`) to force updates.
- The widget persists mute state in localStorage (`bitb_voice_muted`) and records that the greeting was shown with `bitb_greeted`.

---

## What happens now (overview)

- On widget open (user click): the client attempts to play `/greeting-audio.mp3`.
- Mute/unmute is controlled in the header and persisted in `localStorage`.
- A replay button is available in the header for manual playback.

If the static MP3 is missing or fails to load, the widget shows the replay control so users can retry; you can also fall back to browser TTS if desired (see "Optional: legacy server TTS" below).

---

## Troubleshooting & common fixes

- Greeting returns 404 (file not found)
  - Ensure `public/greeting-audio.mp3` exists and is committed to your static assets.

- Greeting doesn't play (no sound)
  - Confirm the user triggered playback via a click. Browsers block autoplay without a user gesture.
  - Check the Network tab for `GET /greeting-audio.mp3` and any errors.
  - Check volume/mute controls in the header.

- Stale/old greeting (you still hear the old voice)
  - Browsers or service workers may cache the file. To force a fresh copy:
    ```javascript
    // In browser devtools console
    localStorage.removeItem('bitb_greeted');
    localStorage.removeItem('bitb_voice_muted');
    // Optionally clear browser cache or use a new filename for the MP3
    ```

- Want to reset the greeting flag for testing:
  - `localStorage.removeItem('bitb_greeted')`

---

## Optional: legacy server TTS (deprecated)

This repository historically supported a server-side Text-to-Speech proxy (`/api/tts`) that used Google Cloud Text-to-Speech. That code remains in the repo for reference, but the recommended flow is the static MP3 above to avoid paid API usage and ensure consistent branding.

If you still want the server TTS route (note: may incur costs):

1. Add a Google Cloud Text-to-Speech API key to your environment (not recommended for public builds):
```powershell
Set-Content -Path .env.local -Value 'GOOGLE_TTS_API_KEY=your_real_google_api_key_here'
```

2. Restart the server and ensure `src/app/api/tts/route.ts` is enabled. The server will return audio content encoded as base64.

3. Be aware of rate limits and costs — this route may require billing enabled on the Google Cloud project.

---

## Notes & tips

- Use versioned filenames (e.g. `greeting-audio-v2.mp3`) to avoid cache issues when updating the greeting.
- The mute state key is `bitb_voice_muted`. Removing it will unmute the greeting for the browser session.
- The greeted state key is `bitb_greeted`. Removing it will make the greeting attempt to play again on the next widget open.

---

If you'd like, I can also add a short troubleshooting snippet to the top-level `README.md` describing how to replace the greeting audio and how to clear the localStorage flags.
