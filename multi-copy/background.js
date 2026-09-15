// Toolbar icon toggles the collecting session on/off, and this worker also
// runs the OCR pipeline: it screenshots the visible tab, then hands the image
// to a hidden offscreen document that runs Tesseract locally.

chrome.action.onClicked.addListener(async () => {
  const { mcActive, mcSnippets } = await chrome.storage.local.get([
    "mcActive",
    "mcSnippets",
  ]);
  const next = !mcActive;
  const patch = { mcActive: next };
  if (next && !Array.isArray(mcSnippets)) patch.mcSnippets = [];
  await chrome.storage.local.set(patch);
});

// --- OCR pipeline -----------------------------------------------------------

const lastCapture = new Map(); // tabId -> screenshot dataURL

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === "MC_CAPTURE") {
    captureTab(sender)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true; // async
  }

  if (msg.type === "MC_OCR") {
    runOcr(msg, sender)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
    return true; // async
  }
});

async function captureTab(sender) {
  const tab = sender.tab;
  if (!tab) return { ok: false, error: "no-tab" };
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: "png",
    });
    lastCapture.set(tab.id, dataUrl);
    return { ok: true };
  } catch (e) {
    // Happens on chrome:// pages, the Web Store, etc.
    return { ok: false, error: "capture-blocked" };
  }
}

async function runOcr(msg, sender) {
  const tab = sender.tab;
  const dataUrl = tab && lastCapture.get(tab.id);
  if (!dataUrl) return { ok: false, error: "no-capture" };

  await ensureOffscreen();

  const res = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "OCR",
    dataUrl,
    rect: msg.rect,
    viewportW: msg.viewportW,
    viewportH: msg.viewportH,
  });

  if (tab) lastCapture.delete(tab.id);
  return res || { ok: false, error: "no-response" };
}

let creatingOffscreen = null;
async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument();
  if (has) return;
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  creatingOffscreen = chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["DOM_SCRAPING"],
    justification: "Run local OCR on a captured screen region.",
  });
  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}
