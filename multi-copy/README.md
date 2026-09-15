# Multi-Copy — area text collector

Draw a box over any text, keep collecting boxes across pages, then copy the whole
lot at once as a single block. Built to be low friction: one button, one drag,
big clear feedback, easy undo.

Part of [LockIn Tools](https://lockintools.com) — free, open source tools for
people who want to focus.

Two capture modes:

- **Text** — grabs the real, selectable text under your box. Fast and exact.
- **Image (OCR)** — screenshots the box and reads the text out of it, so it works
  on images, scanned PDFs, and anything that is not selectable.

Both modes work fully offline. The OCR engine is bundled, so there is no setup
step and nothing you capture ever leaves your computer.

## Install

1. Download the latest `multi-copy.zip` from the
   [Releases page](../../releases/latest).
2. Unzip it somewhere permanent, like your Documents folder. Chrome loads the
   extension from wherever the folder lives, so deleting or moving it later will
   break the extension.
3. Open `chrome://extensions`.
4. Turn on **Developer mode** using the toggle in the top right.
5. Click **Load unpacked** and select the unzipped `multi-copy` folder.
6. Pin it: click the puzzle piece icon in the toolbar, then the pin next to
   Multi-Copy.

Works in Chrome, Edge, Brave, and other Chromium browsers.

Chrome may show a message on startup asking whether to disable developer mode
extensions. Click **Keep** and Multi-Copy keeps working.

## How to use

1. **Click the toolbar icon.** A small panel appears in the bottom right. Drag it
   anywhere by its header.
2. **Pick a mode** with the toggle at the top: Text or Image (OCR).
3. **Press Capture area.** The page dims. Drag a box over what you want. Release
   and the text is added to the stack. `Esc` cancels a box.
4. You drop back to normal browsing, so **scroll or click to the next thing** and
   press **Capture area** again.
5. Repeat as much as you like. The counter shows how many snippets you have and
   the preview shows the last few. **Undo last** removes a mistake.
6. **Press Copy everything.** All snippets land on your clipboard as one block,
   separated by blank lines, and the session clears.

The session survives page loads, so you can navigate away mid collection and the
panel comes back with your stack intact. It also stays in sync across tabs, so
you can collect from several tabs into one result. Click the toolbar icon again
to hide or pause without losing anything. **Clear & close** discards and closes.

## What each mode can and cannot do

- **Text mode** reads real page text inside your box, including values typed into
  inputs and text areas. It cannot read text baked into images, `<canvas>`, or
  image based PDFs. That is what OCR is for.
- **Image (OCR) mode** reads pixels, so it handles images and scans, but it can
  only see what is currently on screen inside the box, and like all OCR it can
  occasionally misread a character.
- Chrome blocks every extension from `chrome://` pages, the Chrome Web Store, and
  a few other special pages, so neither mode works there.

Tips for better OCR: draw the box a little tighter around the text, and zoom the
page in first if the text is small.

## Privacy

Multi-Copy runs entirely on your machine. There are no accounts, no analytics,
and no network requests. Screenshots taken for OCR are processed locally and
discarded immediately. Collected snippets are held in local browser storage until
you copy or clear them.

Permissions used:

- `storage` — keeps your snippet stack across page loads and tabs.
- `clipboardWrite` — writes the final block to your clipboard.
- `tabs` — captures the visible tab for OCR mode.
- `offscreen` — runs the OCR engine in a hidden document.
- `<all_urls>` — lets you capture from any page you choose to use it on.

## Files

- `manifest.json` — extension config (Manifest V3).
- `background.js` — toolbar toggle plus screenshot and OCR coordination.
- `content.js` — the panel, capture overlay, text extraction, clipboard.
- `content.css` — styling for the panel, overlay, and toast.
- `offscreen.html` / `offscreen.js` — hidden page that runs Tesseract locally.
- `icons/` — toolbar and store icons.
- `vendor/` — bundled Tesseract.js engine and English language data.

## Note on the vendor folder

`offscreen.js` creates the worker with `Tesseract.createWorker("eng", 1, ...)`.
The `1` means LSTM only, so Tesseract loads the `-lstm` core files and ignores
the others. All four cores are bundled anyway so that changing that value later
does not break OCR.

## License

MIT. See `LICENSE`.

Tesseract.js and the Tesseract engine files in `vendor/` are distributed under
the Apache License 2.0.
