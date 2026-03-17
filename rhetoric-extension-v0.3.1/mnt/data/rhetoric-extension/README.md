# Rhetoric Lens MVP

Chrome extension MVP for rhetoric analysis using Chrome built-in AI APIs.

## What this version does

- Extracts the headline, subhead, and first paragraphs from the current page.
- Detects the source language locally with the Language Detector API.
- If the text is not English, tries to translate it to English with the Translator API.
- Runs a local rhetoric analysis with the Prompt API and Gemini Nano.
- Returns a rhetoric score, confidence, detected patterns, flagged phrases, a short explanation, and an optional neutral rewrite.

## Important current limitations

1. **Prompt API support for extensions is still in origin-trial / limited rollout territory.** The Chrome docs still mark the Prompt API for Web Extensions as origin-trial based. If your Chrome build requires it, you will need to add your extension origin-trial token to `manifest.json` via the `trial_tokens` field. The rest of the extension is already structured for that path.
2. **Chrome desktop only.** Translator and Language Detector are desktop-only, and Gemini Nano is not available on mobile Chrome.
3. **Hebrew is analyzed through translation.** This is acceptable for an MVP, but nuance can be lost.
4. **This is an MVP scaffold, not a production-grade detector.** It is intended to validate UX and feasibility first.

## Recommended local test setup

Use a recent Chrome desktop build with built-in AI enabled. Chrome's docs say built-in AI APIs are available on `localhost` when these flags are enabled:

- `chrome://flags/#optimization-guide-on-device-model`
- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`

Then reload Chrome.

## Loading the extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder

## If Prompt API requires an origin-trial token

Add a `trial_tokens` array to `manifest.json`, for example:

```json
"trial_tokens": [
  "PUT_YOUR_EXTENSION_TRIAL_TOKEN_HERE"
]
```

## Files

- `manifest.json` — MV3 manifest
- `popup.html` / `popup.css` / `popup.js` — popup UI and analysis pipeline
- `extractor.js` — page text extraction logic


## v0.2 additions

- Automatic analysis runs shortly after each page finishes loading.
- The extension badge now shows the page score directly on the Chrome toolbar.
- Green/yellow/orange/red badge background reflects the current rhetoric band.
- Opening the popup loads the cached analysis automatically for the active tab.
- Use **Re-run analysis** to refresh the result manually or include a neutral rewrite.

If you update from v0.1, reload the unpacked extension in `chrome://extensions` so Chrome picks up the new background service worker and offscreen analyzer document.


## v0.3 additions

- The Chrome badge now reflects **main page rhetoric only** (the page's own framing), not quoted rhetoric.
- The badge uses **three levels**: green, yellow, red.
- The popup now separates:
  - main page rhetoric
  - quoted / attributed rhetoric
  - article stance toward quoted rhetoric
- The analysis prompt and JSON schema now distinguish authorial vs quoted language to reduce false positives on quoted material.
