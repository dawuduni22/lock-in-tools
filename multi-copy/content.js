/* =========================================================================
   Multi-Copy — content script
   -------------------------------------------------------------------------
   Flow:
     1. Click the toolbar icon  -> a draggable panel appears (bottom-right).
     2. Press "Capture area"    -> the page dims, you drag a box over text.
     3. Release the mouse       -> the text inside the box is added to a stack.
                                   You drop straight back to normal browsing so
                                   you can scroll or click to the next question.
     4. Repeat as many times as you like — even across page loads.
     5. Press "Copy everything" -> the whole stack lands on your clipboard as
                                   one block (snippets separated by blank lines).

   State (mcActive + mcSnippets) lives in chrome.storage.local, so navigating
   to another page keeps the session and the collected text intact.
   ========================================================================= */

(() => {
  // Guard against being set up twice in the same document.
  if (window.__adhdMultiCopyLoaded) return;
  window.__adhdMultiCopyLoaded = true;

  const ROOT_ID = "adhd-multicopy-root";
  const OVERLAY_ID = "adhd-multicopy-overlay";

  let panelEl = null;
  let overlayEl = null;
  let arming = false; // currently drawing a selection box?

  /* ---------------------------------------------------------------------
     Storage helpers
     --------------------------------------------------------------------- */
  const getState = () =>
    chrome.storage.local.get(["mcActive", "mcSnippets", "mcPos"]);

  const getSnippets = async () => {
    const { mcSnippets } = await chrome.storage.local.get("mcSnippets");
    return Array.isArray(mcSnippets) ? mcSnippets : [];
  };

  const setSnippets = (list) => chrome.storage.local.set({ mcSnippets: list });

  /* ---------------------------------------------------------------------
     Small SVG icons (inline so we ship no image files)
     --------------------------------------------------------------------- */
  const icon = {
    grip: '<svg class="mc-grip" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke-dasharray="3 3"/><path d="M8 12h8M12 8v8"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  };

  /* ---------------------------------------------------------------------
     Panel construction
     --------------------------------------------------------------------- */
  function buildPanel() {
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.innerHTML = `
      <div class="mc-panel" role="dialog" aria-label="Multi-Copy collector">
        <div class="mc-head" data-mc="drag">
          ${icon.grip}
          <span class="mc-title">Multi-Copy</span>
          <span class="mc-count" data-mc="count">0 collected</span>
        </div>
        <div class="mc-body">
          <div class="mc-seg" role="tablist" aria-label="Capture mode">
            <button class="mc-seg-btn" data-mc="mode-text" role="tab">Text</button>
            <button class="mc-seg-btn" data-mc="mode-ocr" role="tab">Image (OCR)</button>
          </div>
          <p class="mc-hint" data-mc="hint">Press capture, then drag a box over the text you want.</p>
          <div class="mc-preview" data-mc="preview" aria-live="polite"></div>
          <button class="mc-btn mc-primary" data-mc="capture">${icon.box}<span>Capture area</span></button>
          <div class="mc-row">
            <button class="mc-btn" data-mc="undo">${icon.undo}<span>Undo last</span></button>
            <button class="mc-btn mc-primary" data-mc="finish" style="flex:1.4">${icon.copy}<span>Copy everything</span></button>
          </div>
          <button class="mc-btn mc-quiet mc-danger" data-mc="cancel">Clear &amp; close</button>
        </div>
      </div>`;
    document.documentElement.appendChild(root);
    panelEl = root;

    // Wire up buttons
    root.querySelector('[data-mc="capture"]').addEventListener("click", armCapture);
    root.querySelector('[data-mc="undo"]').addEventListener("click", undoLast);
    root.querySelector('[data-mc="finish"]').addEventListener("click", finishAndCopy);
    root.querySelector('[data-mc="cancel"]').addEventListener("click", cancelSession);
    root.querySelector('[data-mc="mode-text"]').addEventListener("click", () => setMode("text"));
    root.querySelector('[data-mc="mode-ocr"]').addEventListener("click", () => setMode("ocr"));

    makeDraggable(root, root.querySelector('[data-mc="drag"]'));
    restorePosition();
    refreshFromStorage();
    loadMode();
  }

  async function loadMode() {
    const { mcMode } = await chrome.storage.local.get("mcMode");
    reflectMode(mcMode === "ocr" ? "ocr" : "text");
  }

  function setMode(mode) {
    chrome.storage.local.set({ mcMode: mode });
    reflectMode(mode);
  }

  function reflectMode(mode) {
    if (!panelEl) return;
    const textBtn = panelEl.querySelector('[data-mc="mode-text"]');
    const ocrBtn = panelEl.querySelector('[data-mc="mode-ocr"]');
    const hint = panelEl.querySelector('[data-mc="hint"]');
    const isOcr = mode === "ocr";
    textBtn.classList.toggle("mc-on", !isOcr);
    ocrBtn.classList.toggle("mc-on", isOcr);
    textBtn.setAttribute("aria-selected", String(!isOcr));
    ocrBtn.setAttribute("aria-selected", String(isOcr));
    hint.textContent = isOcr
      ? "Press capture, then drag a box over an image or scanned text."
      : "Press capture, then drag a box over the text you want.";
  }

  async function currentMode() {
    const { mcMode } = await chrome.storage.local.get("mcMode");
    return mcMode === "ocr" ? "ocr" : "text";
  }

  function removePanel() {
    disarm();
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
  }

  async function refreshFromStorage() {
    const list = await getSnippets();
    renderStack(list);
  }

  function renderStack(list) {
    if (!panelEl) return;
    const n = list.length;
    const countEl = panelEl.querySelector('[data-mc="count"]');
    const previewEl = panelEl.querySelector('[data-mc="preview"]');
    const undoBtn = panelEl.querySelector('[data-mc="undo"]');
    const finishBtn = panelEl.querySelector('[data-mc="finish"]');

    countEl.textContent = `${n} collected`;
    undoBtn.disabled = n === 0;
    finishBtn.disabled = n === 0;

    // Show the last couple of snippets as a reminder of what's in the stack.
    previewEl.textContent = list
      .slice(-3)
      .map((t, i) => {
        const idx = n - Math.min(3, n) + i + 1;
        const short = t.length > 90 ? t.slice(0, 90) + "…" : t;
        return `${idx}. ${short}`;
      })
      .join("\n");
  }

  /* ---------------------------------------------------------------------
     Dragging the panel around
     --------------------------------------------------------------------- */
  function makeDraggable(root, handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;

    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      const r = root.getBoundingClientRect();
      // Switch from right/bottom anchoring to left/top for free movement.
      root.style.left = r.left + "px";
      root.style.top = r.top + "px";
      root.style.right = "auto";
      root.style.bottom = "auto";
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      e.preventDefault();
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
    });

    function onMove(e) {
      if (!dragging) return;
      const w = root.offsetWidth, h = root.offsetHeight;
      let nx = ox + (e.clientX - sx);
      let ny = oy + (e.clientY - sy);
      nx = Math.max(6, Math.min(nx, window.innerWidth - w - 6));
      ny = Math.max(6, Math.min(ny, window.innerHeight - h - 6));
      root.style.left = nx + "px";
      root.style.top = ny + "px";
    }

    function onUp() {
      dragging = false;
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
      const r = root.getBoundingClientRect();
      chrome.storage.local.set({ mcPos: { left: r.left, top: r.top } });
    }
  }

  async function restorePosition() {
    const { mcPos } = await chrome.storage.local.get("mcPos");
    if (mcPos && panelEl) {
      const w = panelEl.offsetWidth, h = panelEl.offsetHeight;
      const left = Math.max(6, Math.min(mcPos.left, window.innerWidth - w - 6));
      const top = Math.max(6, Math.min(mcPos.top, window.innerHeight - h - 6));
      panelEl.style.left = left + "px";
      panelEl.style.top = top + "px";
      panelEl.style.right = "auto";
      panelEl.style.bottom = "auto";
    }
  }

  /* ---------------------------------------------------------------------
     Capture mode: draw a box, then read the text under it
     --------------------------------------------------------------------- */
  function armCapture() {
    if (arming) return;
    arming = true;

    const captureBtn = panelEl?.querySelector('[data-mc="capture"]');
    if (captureBtn) {
      captureBtn.classList.add("mc-arming");
      captureBtn.querySelector("span").textContent = "Drag a box…";
    }

    overlayEl = document.createElement("div");
    overlayEl.id = OVERLAY_ID;
    overlayEl.innerHTML =
      '<div class="mc-guide">Drag a box over the text · <b>Esc</b> to cancel</div>' +
      '<div class="mc-selbox" data-mc="selbox"></div>';
    document.documentElement.appendChild(overlayEl);

    const selbox = overlayEl.querySelector('[data-mc="selbox"]');
    let start = null;

    const onDown = (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      selbox.style.display = "block";
      positionBox(selbox, start.x, start.y, start.x, start.y);
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!start) return;
      positionBox(selbox, start.x, start.y, e.clientX, e.clientY);
    };

    const onUp = (e) => {
      if (!start) return;
      const box = normalize(start.x, start.y, e.clientX, e.clientY);
      start = null;
      finishCapture(box);
    };

    const onKey = (e) => {
      if (e.key === "Escape") disarm();
    };

    overlayEl.addEventListener("mousedown", onDown);
    overlayEl.addEventListener("mousemove", onMove);
    overlayEl.addEventListener("mouseup", onUp);
    window.addEventListener("keydown", onKey, true);

    // Stash listeners so disarm can clean them up.
    overlayEl.__mcCleanup = () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }

  function disarm() {
    arming = false;
    if (overlayEl) {
      if (overlayEl.__mcCleanup) overlayEl.__mcCleanup();
      overlayEl.remove();
      overlayEl = null;
    }
    const captureBtn = panelEl?.querySelector('[data-mc="capture"]');
    if (captureBtn) {
      captureBtn.classList.remove("mc-arming");
      captureBtn.querySelector("span").textContent = "Capture area";
    }
  }

  async function finishCapture(box) {
    disarm();

    // Ignore stray clicks that didn't really draw anything.
    if (box.width < 6 || box.height < 6) return;

    const mode = await currentMode();
    const text =
      mode === "ocr" ? await captureViaOcr(box) : extractTextInRect(box);

    if (text === null) return; // OCR path already showed a message
    if (!text) {
      toast("No text found in that box", "warn");
      return;
    }
    const list = await getSnippets();
    list.push(text);
    await setSnippets(list);
    renderStack(list);
    toast(`Snippet ${list.length} added`);
  }

  // Screenshot the box and OCR it. Returns text, "" (nothing found),
  // or null when we've already shown an error toast.
  async function captureViaOcr(box) {
    // Hide our own UI so it isn't in the screenshot.
    const wasVisible = panelEl && panelEl.style.visibility !== "hidden";
    if (panelEl) panelEl.style.visibility = "hidden";
    hideToast();

    await nextFrame();
    await nextFrame();

    try {
      const cap = await send({ type: "MC_CAPTURE" });
      if (!cap || !cap.ok) {
        if (panelEl && wasVisible) panelEl.style.visibility = "";
        toast(
          cap && cap.error === "capture-blocked"
            ? "This page can't be captured"
            : "Couldn't capture the screen",
          "bad"
        );
        return null;
      }

      if (panelEl && wasVisible) panelEl.style.visibility = "";
      toast("Reading image…", null, true);

      const res = await send({
        type: "MC_OCR",
        rect: { left: box.left, top: box.top, width: box.width, height: box.height },
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
      });

      if (!res || !res.ok) {
        if (res && res.error === "missing-files") {
          toast("OCR engine not installed — see README", "bad");
        } else {
          toast("OCR error: " + ((res && res.error) || "no response"), "bad");
        }
        return null;
      }
      return res.text || "";
    } catch (e) {
      if (panelEl && wasVisible) panelEl.style.visibility = "";
      toast("OCR error: " + (e && e.message ? e.message : "unknown"), "bad");
      return null;
    }
  }

  function nextFrame() {
    return new Promise((r) => requestAnimationFrame(() => r()));
  }

  function send(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (resp) => {
          const err = chrome.runtime.lastError;
          if (err) {
            reject(new Error(err.message));
            return;
          }
          resolve(resp);
        });
      } catch (e) {
        reject(e);
      }
    });
  }

  function positionBox(el, x1, y1, x2, y2) {
    const b = normalize(x1, y1, x2, y2);
    el.style.left = b.left + "px";
    el.style.top = b.top + "px";
    el.style.width = b.width + "px";
    el.style.height = b.height + "px";
  }

  function normalize(x1, y1, x2, y2) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const right = Math.max(x1, x2);
    const bottom = Math.max(y1, y2);
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  /* ---------------------------------------------------------------------
     The actual text extraction.
     We walk every visible text node and keep the words whose on-screen
     rectangle overlaps the box the user drew — so it behaves like a
     screenshot-region grab, but returns real, selectable text (no OCR).
     Form fields (input/textarea) inside the box contribute their values.
     --------------------------------------------------------------------- */
  function intersects(a, box) {
    return (
      a.left < box.right &&
      a.right > box.left &&
      a.top < box.bottom &&
      a.bottom > box.top
    );
  }

  function extractTextInRect(box) {
    const pieces = [];
    const root = document.body || document.documentElement;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const v = node.nodeValue;
        if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT")
          return NodeFilter.FILTER_REJECT;
        // Never grab our own UI.
        if (p.closest("#" + ROOT_ID + ", #" + OVERLAY_ID))
          return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node;
    while ((node = walker.nextNode())) {
      // Quick reject: does the whole node touch the box at all?
      const full = document.createRange();
      full.selectNodeContents(node);
      const nodeRects = full.getClientRects();
      let touches = false;
      for (const r of nodeRects) {
        if (intersects(r, box)) { touches = true; break; }
      }
      if (!touches) continue;

      // Keep only the words whose rectangle overlaps the box.
      const text = node.nodeValue;
      const re = /\S+/g;
      const kept = [];
      let m;
      while ((m = re.exec(text))) {
        const s = m.index;
        const e = s + m[0].length;
        const r = document.createRange();
        try {
          r.setStart(node, s);
          r.setEnd(node, e);
        } catch (_) {
          continue;
        }
        const wr = r.getBoundingClientRect();
        if (wr.width === 0 && wr.height === 0) continue;
        if (intersects(wr, box)) kept.push(m[0]);
      }
      if (kept.length) pieces.push(kept.join(" "));
    }

    // Form fields (typed answers, filled inputs) inside the box.
    const skipTypes = [
      "button", "submit", "checkbox", "radio", "range",
      "color", "file", "image", "reset", "hidden", "password",
    ];
    document.querySelectorAll("input, textarea").forEach((el) => {
      if (el.closest("#" + ROOT_ID)) return;
      if (el.tagName === "INPUT" && skipTypes.includes((el.type || "").toLowerCase()))
        return;
      const wr = el.getBoundingClientRect();
      if (wr.width === 0 && wr.height === 0) return;
      if (intersects(wr, box)) {
        const val = (el.value || "").trim();
        if (val) pieces.push(val);
      }
    });

    return pieces
      .join(" ")
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/ *\n */g, "\n")
      .trim();
  }

  /* ---------------------------------------------------------------------
     Stack actions
     --------------------------------------------------------------------- */
  async function undoLast() {
    const list = await getSnippets();
    if (!list.length) return;
    list.pop();
    await setSnippets(list);
    renderStack(list);
    toast("Removed the last snippet", "warn");
  }

  async function finishAndCopy() {
    const list = await getSnippets();
    const combined = list.join("\n\n");
    if (!combined) {
      toast("Nothing collected yet", "warn");
      return;
    }
    const ok = await copyToClipboard(combined);
    if (ok) {
      await chrome.storage.local.set({ mcSnippets: [], mcActive: false });
      toast(`Copied ${list.length} snippet${list.length > 1 ? "s" : ""} to clipboard`);
    } else {
      toast("Couldn't reach the clipboard — try again", "bad");
    }
  }

  async function cancelSession() {
    await chrome.storage.local.set({ mcSnippets: [], mcActive: false });
  }

  async function copyToClipboard(text) {
    // Preferred path (needs a secure context + document focus).
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {
      /* fall through */
    }
    // Fallback that works under the button's user gesture on any page.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.top = "-9999px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (_) {
      return false;
    }
  }

  /* ---------------------------------------------------------------------
     Toast
     --------------------------------------------------------------------- */
  let toastEl = null;
  let toastTimer = null;
  function toast(msg, kind, sticky) {
    // Kept on <html>, not inside the panel, so a "Copied" message stays
    // visible even though copying also closes the panel.
    if (!toastEl || !toastEl.isConnected) {
      toastEl = document.createElement("div");
      document.documentElement.appendChild(toastEl);
    }
    toastEl.className = "mc-toast" + (kind ? " mc-" + kind : "");
    toastEl.textContent = msg;
    void toastEl.offsetWidth; // reflow so the transition runs
    toastEl.classList.add("mc-show");
    clearTimeout(toastTimer);
    if (!sticky) {
      toastTimer = setTimeout(() => {
        if (toastEl) toastEl.classList.remove("mc-show");
      }, 1900);
    }
  }

  function hideToast() {
    clearTimeout(toastTimer);
    if (toastEl) toastEl.classList.remove("mc-show");
  }

  /* ---------------------------------------------------------------------
     React to session on/off and stack changes (also keeps tabs in sync)
     --------------------------------------------------------------------- */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if ("mcActive" in changes) {
      if (changes.mcActive.newValue) {
        if (!panelEl) buildPanel();
      } else {
        removePanel();
      }
    }

    if ("mcSnippets" in changes && panelEl) {
      renderStack(changes.mcSnippets.newValue || []);
    }
  });

  // On (re)load — e.g. after navigating to the next question's page —
  // bring the panel back if a session is active.
  (async () => {
    const { mcActive } = await getState();
    if (mcActive) buildPanel();
  })();
})();
