importScripts('content/defaults.js');

const D = globalThis.HKP_DEFAULTS;
const SCRIPT_ID = 'hkp-custom-sites';
const CONTENT_FILES = ['content/defaults.js', 'content/sites.js', 'content/content.js'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&family=JetBrains+Mono:wght@400;600&display=swap';

/* ---------- install ---------- */

chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['hkp_buttons', 'hkp_settings']);
  const patch = {};
  if (!Array.isArray(data.hkp_buttons)) patch.hkp_buttons = D.makeButtons();
  if (!data.hkp_settings) patch.hkp_settings = { ...D.settings };
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  await syncCustomSites().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  syncCustomSites().catch(() => {});
});

/* ---------- keyboard shortcuts ---------- */

chrome.commands.onCommand.addListener(async (command) => {
  const { hkp_settings } = await chrome.storage.local.get('hkp_settings');
  const s = { ...D.settings, ...(hkp_settings || {}) };
  if (command === 'toggle-panel') s.panelVisible = !s.panelVisible;
  if (command === 'toggle-paste-mode') s.pasteMode = !s.pasteMode;
  await chrome.storage.local.set({ hkp_settings: s });
});

/* ---------- messages ---------- */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;

  if (msg.type === 'hkp:readClipboard') {
    readClipboard().then((text) => sendResponse({ text }), () => sendResponse({ text: null }));
    return true;
  }

  if (msg.type === 'hkp:getFonts') {
    getFonts().then((faces) => sendResponse(faces), () => sendResponse([]));
    return true;
  }

  return false;
});

/* ---------- clipboard (offscreen document) ---------- */

let creatingOffscreen = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (contexts.length) return;
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: 'Read copied text for paste and send mode.'
    }).finally(() => { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function readClipboard() {
  await ensureOffscreen();
  const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'read-clipboard' });
  return r && typeof r.text === 'string' ? r.text : null;
}

/* ---------- fonts ----------
   Downloaded once from Google Fonts and cached. The panel loads them from
   memory, so strict site security rules cannot block them. */

let fontPromise = null;

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
}

async function fetchFonts() {
  const cached = (await chrome.storage.local.get('hkp_fonts')).hkp_fonts;
  if (cached && cached.v === 1 && Array.isArray(cached.faces) && cached.faces.length) return cached.faces;

  const css = await (await fetch(FONT_CSS)).text();
  const blocks = css.match(/\/\*\s*latin\s*\*\/\s*@font-face\s*\{[^}]*\}/g) || [];
  const byUrl = new Map();
  const faces = [];

  for (const block of blocks) {
    const family = (/font-family:\s*'([^']+)'/.exec(block) || [])[1];
    const weight = (/font-weight:\s*(\d+)/.exec(block) || [])[1] || '400';
    const url = (/url\((https:[^)]+)\)/.exec(block) || [])[1];
    if (!family || !url) continue;
    if (!byUrl.has(url)) byUrl.set(url, toBase64(await (await fetch(url)).arrayBuffer()));
    faces.push({
      family: family === 'Chakra Petch' ? 'HKP Chakra' : 'HKP Mono',
      weight,
      data: byUrl.get(url)
    });
  }

  if (faces.length) await chrome.storage.local.set({ hkp_fonts: { v: 1, faces } });
  return faces;
}

function getFonts() {
  if (!fontPromise) fontPromise = fetchFonts().catch((err) => { fontPromise = null; throw err; });
  return fontPromise;
}

/* ---------- sites the user adds ---------- */

async function syncCustomSites() {
  const { hkp_custom_sites = [] } = await chrome.storage.local.get('hkp_custom_sites');
  const granted = [];
  for (const pattern of hkp_custom_sites) {
    try {
      if (await chrome.permissions.contains({ origins: [pattern] })) granted.push(pattern);
    } catch (_) { /* malformed pattern, drop it */ }
  }
  if (granted.length !== hkp_custom_sites.length) await chrome.storage.local.set({ hkp_custom_sites: granted });

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  if (!granted.length) {
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
    return;
  }
  if (existing.length) {
    await chrome.scripting.updateContentScripts([{ id: SCRIPT_ID, matches: granted }]);
  } else {
    await chrome.scripting.registerContentScripts([{
      id: SCRIPT_ID,
      matches: granted,
      js: CONTENT_FILES,
      runAt: 'document_idle',
      persistAcrossSessions: true
    }]);
  }
}

chrome.permissions.onAdded.addListener(async ({ origins = [] }) => {
  const { hkp_custom_sites = [] } = await chrome.storage.local.get('hkp_custom_sites');
  const added = origins.filter((o) => /^https?:\/\//.test(o) && !hkp_custom_sites.includes(o));
  if (!added.length) return;
  await chrome.storage.local.set({ hkp_custom_sites: [...hkp_custom_sites, ...added] });
  await syncCustomSites();

  for (const pattern of added) {
    const tabs = await chrome.tabs.query({ url: pattern }).catch(() => []);
    for (const tab of tabs) {
      chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES }).catch(() => {});
    }
  }
});

chrome.permissions.onRemoved.addListener(async ({ origins = [] }) => {
  if (!origins.length) return;
  const { hkp_custom_sites = [] } = await chrome.storage.local.get('hkp_custom_sites');
  await chrome.storage.local.set({ hkp_custom_sites: hkp_custom_sites.filter((p) => !origins.includes(p)) });
  await syncCustomSites();
});
