// Runs inside the hidden offscreen document. Receives a screenshot + the box
// the user drew, crops to that box, and OCRs it with a locally-bundled
// Tesseract engine (files live in vendor/). Nothing here touches the network.

let workerPromise = null; // reused across captures so we init the engine once

function url(path) {
  return chrome.runtime.getURL(path);
}

// Make sure the engine files were actually dropped into vendor/ before we try
// to spin up the worker (createWorker otherwise hangs on a failed fetch).
async function checkVendorFiles() {
  const needed = ["vendor/worker.min.js", "vendor/eng.traineddata.gz"];
  for (const f of needed) {
    try {
      const r = await fetch(url(f), { method: "GET" });
      if (!r.ok) return false;
    } catch (_) {
      return false;
    }
  }
  return true;
}

async function getWorker() {
  if (workerPromise) return workerPromise;

  workerPromise = (async () => {
    if (typeof Tesseract === "undefined") {
      throw new Error("engine-not-loaded");
    }
    const worker = await Tesseract.createWorker("eng", 1, {
      workerPath: url("vendor/worker.min.js"),
      corePath: url("vendor"), // directory holding the 4 core files
      langPath: url("vendor"), // holds eng.traineddata.gz
      workerBlobURL: false, // load the worker directly (extension CSP-friendly)
      gzip: true,
    });
    return worker;
  })();

  // If init fails, let the next attempt retry from scratch.
  workerPromise.catch(() => {
    workerPromise = null;
  });

  return workerPromise;
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image-decode"));
    img.src = dataUrl;
  });
}

// Crop the screenshot to the drawn box and upscale small regions a little,
// which noticeably improves OCR accuracy on body-sized text.
function cropToCanvas(img, rect, viewportW, viewportH) {
  const scaleX = img.width / viewportW;
  const scaleY = img.height / viewportH;

  let sx = Math.max(0, Math.round(rect.left * scaleX));
  let sy = Math.max(0, Math.round(rect.top * scaleY));
  let sw = Math.min(img.width - sx, Math.round(rect.width * scaleX));
  let sh = Math.min(img.height - sy, Math.round(rect.height * scaleY));
  if (sw < 1 || sh < 1) throw new Error("empty-crop");

  const up = Math.min(3, Math.max(1, 1600 / sw));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * up);
  canvas.height = Math.round(sh * up);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(label || "timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function doOcr(msg) {
  const ok = await checkVendorFiles();
  if (!ok) return { ok: false, error: "missing-files" };

  const img = await loadImage(msg.dataUrl);
  const canvas = cropToCanvas(img, msg.rect, msg.viewportW, msg.viewportH);

  const worker = await withTimeout(getWorker(), 30000, "engine-timeout");
  const result = await withTimeout(
    worker.recognize(canvas),
    60000,
    "ocr-timeout"
  );

  const text = (result && result.data && result.data.text ? result.data.text : "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { ok: true, text };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen" || msg.type !== "OCR") return;
  doOcr(msg)
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ ok: false, error: String(e && e.message || e) }));
  return true; // async response
});
