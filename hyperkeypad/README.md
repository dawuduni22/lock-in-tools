# HyperKeypad: AI Keypad

A floating keypad for AI chat sites. Press a key to send a saved prompt like "Next topic" or "Explain that again", or turn on paste mode and send whatever you copied with a single key.

Part of Lock In Tools (lockintools.com). Free and open source under the MIT license.

## Features

**Keypad.** A small panel you can drag, resize, and collapse into a single key. It remembers its position on each site.

**Prompt keys.** Nine keys come ready for studying and writing: Next topic, Explain again, Give an example, Quiz me, Summarize, Go deeper, Explain this, Improve prompt, and Fix grammar. Add, edit, reorder, or delete any of them.

**Key mode.** One switch controls what every key does. Type only puts the prompt in the chat box without sending, so you can add to it. Send + clipboard adds the text you copied after the prompt and sends both. If a prompt contains `{clipboard}`, your copied text goes in that spot instead of at the end.

**Paste and send mode.** When it is on, one key pastes your clipboard into the chat and sends it. The default key is Tab, and you can change it to any single key in Settings. You can also set a paste template to wrap every paste, such as `Explain this: {clipboard}`.

**Shortcuts.** Alt + 1 to 9 presses your first nine keys. Alt + Shift + K shows or hides the keypad. Alt + Shift + P turns paste mode on or off. Change the last two at `chrome://extensions/shortcuts`.

**Backup and restore.** Settings has a Download backup button that saves a `.hkpad` file. Restore backup only opens `.hkpad` files, so your backups are easy to find.

## Supported sites

Built in: Claude, ChatGPT, Gemini, Google AI Studio, Grok, DeepSeek, Kimi, Mistral Le Chat, Perplexity, Qwen Chat, Z.ai, Microsoft Copilot, Meta AI, Poe, HuggingChat, LMArena, T3 Chat, and Duck.ai.

Any other site: open it, click the HyperKeypad icon in your toolbar, and press Add this site. This works for self hosted tools like Open WebUI too. Chrome asks for permission for that one site only.

If a site changes its layout and a key stops sending, click once inside the chat box and try again. The keypad falls back to finding the chat box you last clicked.

## Install

1. Download hyperkeypad.zip from lockintools.com and unzip it.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click Load unpacked and select the `hyperkeypad` folder.
4. Refresh any AI chat tabs that were already open.

## Privacy

Your keys and settings stay in your browser's local extension storage. The clipboard is only read at the moment you press a paste key or a key that uses `{clipboard}`. Nothing is sent anywhere except to the chat you are typing into. On first run the extension downloads its two fonts (Chakra Petch and JetBrains Mono) from Google Fonts and keeps them cached.

## Files

```
manifest.json      Extension setup and the list of built in sites
background.js      Shortcuts, clipboard access, font cache, and sites you add
offscreen.html/js  Reads the clipboard for the background worker
content/defaults.js  Default keys and settings
content/sites.js     Finds the chat box on each site, types into it, and sends
content/content.js   The floating keypad, editor, settings, and backup
popup/             Toolbar popup
icons/             Extension icons
```

To add a site permanently, add its address to `content_scripts.matches` in `manifest.json`. If it needs special handling, add an entry to `ADAPTERS` in `content/sites.js` with selectors for its chat box and send button.

## License

MIT
