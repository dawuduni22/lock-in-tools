# Lock In Tools

Three free, open source tools that cut the busywork out of focused work.
All three run entirely on the user's own device. No accounts, no servers,
nothing tracked.

Live site: **[lockintools.com](https://lockintools.com)**
Site source: [dawuduni22/lockintools](https://github.com/dawuduni22/lockintools)

| Tool | Platform | What it does |
|---|---|---|
| [HyperKeypad](#hyperkeypad) | Chrome extension | A floating keypad on any AI chat. One key sends a saved prompt, or pastes and sends your clipboard. |
| [Multi-Copy](#multi-copy) | Chrome extension | Collect text from anywhere, paste it all at once. Reads text out of images and locked PDFs using on-device OCR. |
| [Feed Blur](#feed-blur) | Android app | Hides the Instagram feed, Reels, and Explore. Leaves messages and search untouched. |

---

## The problem

Focused work gets interrupted by the same small frictions over and over.

You type the same instruction into an AI chat for the tenth time that day.
You copy one paragraph from your notes, switch windows, paste it, switch back,
and repeat, and half the time the text you need is locked inside a screenshot
so you retype it by hand. You open Instagram to reply to one message and land
on a feed engineered to keep you there.

None of that is the work. It is overhead, and it adds up to hours a week.

---

## The AI in it

**Multi-Copy runs a real neural network locally, with no server and no API key.**

It bundles the Tesseract LSTM recognition engine compiled to WebAssembly,
around 22 MB of model and runtime, in [`multi-copy/vendor/`](multi-copy/vendor).
Recognition happens inside a Chrome offscreen document on the user's own
machine. Nothing is uploaded, including the screenshot.

The pipeline, in [`multi-copy/offscreen.js`](multi-copy/offscreen.js):

1. The service worker captures the visible tab as a PNG.
2. The image is cropped to the box the user drew.
3. Small regions are upscaled up to 3x, which sharply improves accuracy on
   body-sized text.
4. The canvas is passed to the LSTM recognizer.
5. The text is normalised and pushed onto the snippet stack.

The convenient way to build this is to POST the image to a cloud vision API.
That would mean every page of notes, every document, and every screenshot a
user captures passing through someone else's server. Running the model on
device removes that completely, at the cost of a much larger extension. That
trade was made deliberately.

**HyperKeypad solves the other half.** It is not a model. It is the interface
layer that makes models faster to actually use, which is where most of the
day-to-day friction of working with AI actually sits.

---

## HyperKeypad

A floating keypad that sits on top of any AI chat.

- Nine prompt keys ready to go. Add, edit, reorder, or delete any of them.
- Paste mode: one key sends your clipboard, optionally wrapped in a template,
  so "Explain this" plus your copied text goes out in a single keystroke.
- Put `{clipboard}` anywhere in a prompt and your copied text lands in that
  exact spot.
- `Alt` + `1` to `9` fires your first nine keys. `Alt Shift K` hides the pad,
  `Alt Shift P` toggles paste mode.
- Drag, resize, or collapse it to a single key. It remembers its position per
  site.
- Backup and restore your keys as a `.hkpad` file.

**Eighteen sites supported out of the box:** Claude, ChatGPT, Gemini, Google AI
Studio, Grok, DeepSeek, Kimi, Mistral Le Chat, Perplexity, Qwen, Z.ai,
Microsoft Copilot, Meta AI, Poe, HuggingChat, LMArena, T3 Chat, Duck.ai.

Any other site works too: open it, click the toolbar icon, press Add this site.
Chrome asks permission for that one origin only.

### Source

| File | Role |
|---|---|
| [`manifest.json`](hyperkeypad/manifest.json) | Manifest V3 config and the built-in site list |
| [`background.js`](hyperkeypad/background.js) | Shortcuts, clipboard access, font cache, user-added sites |
| [`content/sites.js`](hyperkeypad/content/sites.js) | Per-site adapters: find the chat box, type into it, send |
| [`content/content.js`](hyperkeypad/content/content.js) | The keypad, editor, settings, backup |
| [`content/defaults.js`](hyperkeypad/content/defaults.js) | Default keys and settings |
| [`offscreen.js`](hyperkeypad/offscreen.js) | Reads the clipboard for the service worker |
| [`popup/`](hyperkeypad/popup) | Toolbar popup and the Add this site button |

---

## Multi-Copy

Collect text from anywhere, then paste it all at once.

- Two modes. **Text** grabs the real selectable text under your box and is
  exact. **Image** runs OCR on the pixels, so it works on screenshots,
  diagrams, and locked PDFs.
- Collect across as many pages and tabs as you want. The stack survives page
  loads and stays in sync between tabs.
- Undo the last capture without losing the rest.
- Copy everything lands the whole stack on your clipboard as one block.

### Source

| File | Role |
|---|---|
| [`manifest.json`](multi-copy/manifest.json) | Manifest V3 config |
| [`background.js`](multi-copy/background.js) | Toolbar toggle, tab capture, OCR coordination |
| [`content.js`](multi-copy/content.js) | Panel, capture overlay, text extraction, clipboard |
| [`offscreen.js`](multi-copy/offscreen.js) | Runs the Tesseract LSTM engine locally |
| [`vendor/`](multi-copy/vendor) | The bundled engine and English model |

---

## Feed Blur

An Android app that separates Instagram's two halves.

- Hides the home feed, Reels, and the Explore grid.
- Leaves messages, Stories, profiles, and search working exactly as before.
- Mutes media while a surface is covered, then restores the previous volume.
- Turning a block on is instant. Turning one off requires finishing a
  deliberately annoying fifteen step puzzle, so switching it off is slower
  than simply closing the app. That asymmetry is the whole design.

Built in Kotlin using an Android accessibility service to identify the
foreground Instagram screen, plus an overlay permission to draw on top of it.

### Source

| File | Role |
|---|---|
| [`FeedBlurService.kt`](feed-blur/app/src/main/java/com/example/feedblur/FeedBlurService.kt) | The accessibility service: screen detection, blur overlays, audio focus, puzzle gate |
| [`MainActivity.kt`](feed-blur/app/src/main/java/com/example/feedblur/MainActivity.kt) | Setup screen, permission prompts, per-surface switches |
| [`Prefs.kt`](feed-blur/app/src/main/java/com/example/feedblur/Prefs.kt) | Stored settings |
| [`AndroidManifest.xml`](feed-blur/app/src/main/AndroidManifest.xml) | Permissions and service registration |

Kotlin, minSdk 31, targetSdk 36. Open `feed-blur/` in Android Studio, or run
`./gradlew assembleRelease`. A prebuilt
[`feedblur.apk`](feed-blur/feedblur.apk) is included for installing without
building.

---

## Install and run

Neither extension is in the Chrome Web Store, so they load as unpacked
extensions. Nothing needs building and there are no dependencies to install.

```bash
git clone https://github.com/dawuduni22/lock-in-tools.git
```

Then, for each extension:

1. Open `chrome://extensions`
2. Turn on **Developer mode**, top right
3. Click **Load unpacked**
4. Select `lock-in-tools/hyperkeypad` or `lock-in-tools/multi-copy`
5. Pin it: puzzle piece icon in the toolbar, then the pin
6. For HyperKeypad, refresh any AI chat tabs that were already open

Works in Chrome, Edge, Brave, and other Chromium browsers.

For Feed Blur, either open `feed-blur/` in Android Studio and run it, or
install the included [`feed-blur/feedblur.apk`](feed-blur/feedblur.apk) on an
Android 12 to 16 device. Full steps are at
[lockintools.com/feed-blur](https://lockintools.com/feed-blur).

---

## Architecture notes

**Why Multi-Copy needs an offscreen document.** Manifest V3 replaced background
pages with service workers, which have no DOM. Tesseract needs a DOM to create
its canvas and worker, so it cannot run in the service worker. The
`chrome.offscreen` API creates a hidden document that can. The service worker
captures the tab, hands the image to the offscreen document, and gets text
back.

**Why the content security policy needs `wasm-unsafe-eval`.** Compiling
WebAssembly counts as evaluation under the default extension CSP. Without that
directive the engine fails to instantiate. It does not permit JavaScript `eval`.

**Why the worker is loaded directly rather than as a blob URL.** Tesseract.js
defaults to wrapping its worker in a blob URL, which an extension CSP blocks.
Setting `workerBlobURL: false` and pointing `workerPath` at the local file
avoids it.

**Why HyperKeypad has a fallback selector.** Eighteen chat sites means eighteen
different DOM structures, and several changed during development. Hard-coded
selectors alone are too brittle, so when an adapter cannot find the chat box
the keypad falls back to the last element the user clicked into.

---

## Privacy

There is no backend. Nothing in this repository makes a network request to a
server owned by the author.

- **Multi-Copy** reads the page you are on and, in Image mode, screenshots the
  visible tab. Both stay local. Snippets live in `chrome.storage.local` until
  you copy or clear them.
- **HyperKeypad** reads the clipboard only at the moment you press a paste key,
  and sends that text only to the chat you are already typing into. Keys and
  settings live in local extension storage.
- **Feed Blur** runs entirely on the phone and sends nothing anywhere.
- **The website** has no cookies, analytics, or trackers. Its source is in a separate repository.

None of these tools are connected to, endorsed by, or affiliated with
Instagram, Meta, Google, OpenAI, Anthropic, or any other company named here.

---

## Built with

JavaScript, Chrome Extensions Manifest V3, WebAssembly, Tesseract.js (LSTM
OCR), Chrome offscreen API, service workers, clipboard API,
`chrome.storage.local`, Canvas, Kotlin, Android accessibility services, HTML,
CSS, Vercel.

Claude was used throughout development, mainly on the parts where the unknowns
were technical rather than product: getting Tesseract to initialise under
Manifest V3, reasoning about eighteen different DOM structures, and iterating
the site layout against real measurements of the rendered page.

---

## License

MIT. See [LICENSE](LICENSE).

Tesseract.js and the engine files in `multi-copy/vendor/` are distributed under
the Apache License 2.0.
