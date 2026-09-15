(() => {
  if (globalThis.__HKP_LOADED) return;
  globalThis.__HKP_LOADED = true;

  const D = globalThis.HKP_DEFAULTS;
  const S = globalThis.HKP_SITES;
  const HOST = location.hostname;
  const K = { buttons: 'hkp_buttons', settings: 'hkp_settings', layout: 'hkp_layout' };
  const ORB = 46;
  const MIN_W = 240;
  const MIN_H = 190;

  const state = {
    buttons: [],
    settings: { ...D.settings },
    layout: null,
    view: 'keys',
    editingId: null,
    capturing: false,
    confirmDelete: null,
    confirmReset: false,
    busy: false,
    justDragged: false
  };
  let alive = true;

  const ICONS = {
    mark: '<svg viewBox="0 0 20 20"><rect x="2" y="2" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="chev" d="M6.3 7l3 3-3 3M10.5 7l3 3-3 3" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit: '<svg viewBox="0 0 16 16"><path d="M3 13l.8-3.2L10.6 3a1.4 1.4 0 0 1 2 0l.4.4a1.4 1.4 0 0 1 0 2L6.2 12.2 3 13z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
    sliders: '<svg viewBox="0 0 16 16"><path d="M2.5 4.5h11M2.5 11.5h11" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="6" cy="4.5" r="1.9" fill="currentColor"/><circle cx="10.5" cy="11.5" r="1.9" fill="currentColor"/></svg>',
    min: '<svg viewBox="0 0 16 16"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 16 16"><path d="M10 3.5L5.5 8 10 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 16 16"><path d="M4 10l4-4 4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 16 16"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'
  };

  const STYLES = `
:host {
  --ink: #0D1B2E; --panel: #102238; --key: #17304F; --key-top: #1E3B60; --edge: #081424;
  --line: #2A4A6E; --line-hi: #3E6792; --text: #E6F1FF; --dim: #8BA6C6;
  --signal: #4FD8FF; --armed: #FFB23E; --armed-edge: #8A5A10; --danger: #FF7A7A;
  --ui: 'HKP Chakra', 'Chakra Petch', 'Segoe UI', system-ui, sans-serif;
  --mono: 'HKP Mono', 'JetBrains Mono', ui-monospace, Consolas, monospace;
}
*, *::before, *::after { box-sizing: border-box; }
button, input, textarea { font: inherit; color: inherit; margin: 0; }
:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
.hidden { display: none !important; }

.panel {
  position: fixed; display: flex; flex-direction: column;
  background: var(--panel); color: var(--text);
  border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 20px 50px rgba(2, 8, 20, .55), inset 0 1px 0 rgba(255, 255, 255, .05);
  font-family: var(--ui); font-size: 13px; line-height: 1.35; text-align: left;
  -webkit-font-smoothing: antialiased; overflow: hidden;
}

.bar {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  height: 40px; padding: 0 6px 0 10px;
  background: var(--ink); border-bottom: 1px solid var(--line);
  cursor: grab; touch-action: none; user-select: none;
}
.bar:active { cursor: grabbing; }
.brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
.brand .name { font-weight: 700; font-size: 13.5px; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mark { display: grid; place-items: center; color: var(--text); }
.mark svg { width: 18px; height: 18px; display: block; }
.mark .chev { stroke: var(--signal); }
.tools { display: flex; gap: 2px; }
.icon {
  display: grid; place-items: center; width: 28px; height: 28px; padding: 0;
  border: 0; border-radius: 7px; background: transparent; color: var(--dim); cursor: pointer;
}
.icon:hover { background: var(--key); color: var(--text); }
.icon:disabled { opacity: .3; cursor: default; background: transparent; }
.icon.sm { width: 24px; height: 24px; }
.ico { display: grid; place-items: center; }
.ico svg { width: 16px; height: 16px; display: block; }

.cap {
  display: inline-grid; place-items: center; min-width: 46px; height: 32px; padding: 0 9px;
  border: 1px solid var(--line); border-radius: 7px;
  background: linear-gradient(180deg, var(--key-top), var(--key));
  box-shadow: 0 3px 0 var(--edge);
  font-family: var(--mono); font-weight: 600; font-size: 12px; color: var(--dim); white-space: nowrap;
}
.cap.listening { color: var(--signal); border-color: var(--signal); animation: blink 1s steps(2) infinite; }
@keyframes blink { 50% { border-color: var(--line); } }

.arm {
  flex: none; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  margin: 10px 10px 4px; padding: 8px 12px 10px 8px;
  border: 1px solid var(--line); border-radius: 10px; background: var(--ink);
  cursor: pointer; text-align: left; transition: border-color .15s;
}
.arm:hover { border-color: var(--line-hi); }
.arm-text { display: grid; min-width: 0; }
.arm .t1 { font-weight: 600; font-size: 13px; }
.arm .t2 { font-size: 11.5px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.led { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid var(--dim); }
.arm.on { border-color: rgba(255, 178, 62, .55); background: linear-gradient(90deg, rgba(255, 178, 62, .10), transparent 70%), var(--ink); }
.arm.on .cap { color: #1F1404; background: var(--armed); border-color: var(--armed); box-shadow: 0 3px 0 var(--armed-edge), 0 0 18px rgba(255, 178, 62, .45); }
.arm.on .t2 { color: #F4D39C; }
.on .led { background: var(--armed); border-color: var(--armed); box-shadow: 0 0 10px var(--armed); }
.arm.fire .cap { animation: fire .45s ease-out; }
@keyframes fire {
  0% { transform: translateY(2px); box-shadow: 0 1px 0 var(--armed-edge), 0 0 0 0 rgba(255, 178, 62, .9); }
  100% { transform: none; box-shadow: 0 3px 0 var(--armed-edge), 0 0 0 14px rgba(255, 178, 62, 0); }
}

.mode {
  flex: none; display: grid; grid-template-columns: 1fr 1fr; gap: 3px;
  margin: 6px 10px 2px; padding: 3px;
  border: 1px solid var(--line); border-radius: 9px; background: var(--ink);
}
.seg {
  height: 28px; padding: 0 6px; border: 0; border-radius: 6px; background: transparent;
  color: var(--dim); font-weight: 600; font-size: 12px; cursor: pointer; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.seg:hover { color: var(--text); }
.seg.active { background: linear-gradient(180deg, var(--key-top), var(--key)); color: var(--text); box-shadow: inset 0 0 0 1px var(--signal); }

.keys {
  flex: 1; overflow: auto; padding: 8px 10px 14px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 9px; align-content: start;
  background-image: radial-gradient(rgba(79, 216, 255, .06) 1px, transparent 1.2px); background-size: 12px 12px;
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
}
.key {
  position: relative; min-height: 56px; padding: 19px 10px 9px;
  border: 1px solid var(--line); border-radius: 9px;
  background: linear-gradient(180deg, var(--key-top), var(--key));
  box-shadow: 0 3px 0 var(--edge);
  font-weight: 600; font-size: 13px; text-align: left; cursor: pointer;
  transition: transform 80ms, box-shadow 80ms, border-color 150ms;
}
.key:hover { border-color: var(--line-hi); }
.key:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--edge); }
.key .legend { position: absolute; top: 5px; left: 8px; font-family: var(--mono); font-size: 10px; font-weight: 400; color: var(--dim); }
.key .label { display: block; overflow-wrap: anywhere; }
.key.fired { border-color: var(--signal); box-shadow: 0 3px 0 var(--edge), 0 0 0 1px var(--signal), 0 0 16px rgba(79, 216, 255, .35); }
.empty { grid-column: 1 / -1; display: grid; justify-items: start; gap: 8px; padding: 8px 2px; color: var(--dim); }
.empty p { margin: 0; }

.pane {
  flex: 1; overflow: auto; padding: 12px 12px 18px;
  display: flex; flex-direction: column; gap: 12px;
  scrollbar-width: thin; scrollbar-color: var(--line) transparent;
}
.list { display: flex; flex-direction: column; gap: 6px; }
.row {
  display: flex; align-items: center; gap: 4px; padding: 5px 5px 5px 8px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--ink);
}
.row .idx { width: 16px; font-family: var(--mono); font-size: 10.5px; color: var(--dim); }
.row .row-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
.actions, .inline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.btn {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px;
  border: 1px solid var(--line); border-radius: 8px; background: var(--key);
  font-weight: 600; font-size: 12.5px; cursor: pointer; white-space: nowrap;
}
.btn:hover { border-color: var(--line-hi); }
.btn.xs { height: 28px; padding: 0 10px; font-size: 12px; }
.btn.primary { background: var(--signal); border-color: var(--signal); color: #032431; }
.btn.primary:hover { background: #7BE3FF; }
.btn.ghost { background: transparent; }
.btn.danger { color: var(--danger); border-color: rgba(255, 122, 122, .5); background: transparent; }
.btn .ico svg { width: 14px; height: 14px; }
.group { display: flex; flex-direction: column; gap: 8px; padding-bottom: 12px; border-bottom: 1px solid var(--line); }
.group:last-child { border-bottom: 0; padding-bottom: 0; }
.group h3 { margin: 0; font-size: 13px; font-weight: 700; }
.keyrow { display: flex; align-items: center; gap: 10px; }
.field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; color: var(--dim); }
.field input, .field textarea {
  width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--ink); color: var(--text); font-size: 13px; outline: none; user-select: text;
}
.field textarea { font-family: var(--mono); font-size: 12px; line-height: 1.5; resize: vertical; min-height: 70px; }
.field input:focus, .field textarea:focus { border-color: var(--signal); }
.hint { margin: 0; font-size: 11.5px; color: var(--dim); }
.error { margin: 0; min-height: 0; font-size: 12px; color: var(--danger); }
.error:empty { display: none; }
.check { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.check { align-items: flex-start; }
.check input { margin-top: 1px; flex: none; accent-color: var(--signal); width: 15px; height: 15px; }

.grip {
  position: absolute; right: 1px; bottom: 1px; width: 16px; height: 16px; cursor: nwse-resize; touch-action: none;
  background: linear-gradient(135deg, transparent 52%, var(--line-hi) 52% 60%, transparent 60% 70%, var(--line-hi) 70% 78%, transparent 78%);
}

.orb {
  position: fixed; width: ${ORB}px; height: ${ORB}px; padding: 0;
  display: grid; place-items: center;
  border: 1px solid var(--line); border-radius: 12px;
  background: linear-gradient(180deg, var(--key-top), var(--key));
  box-shadow: 0 3px 0 var(--edge), 0 12px 30px rgba(2, 8, 20, .5);
  color: var(--text); cursor: grab; touch-action: none;
}
.orb .mark svg { width: 22px; height: 22px; }
.orb .led { position: absolute; top: 6px; right: 6px; width: 7px; height: 7px; border-width: 1px; }
.orb.on { border-color: rgba(255, 178, 62, .6); }

.toast {
  position: fixed; padding: 8px 11px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--ink); color: var(--text); font-family: var(--ui); font-size: 12.5px; line-height: 1.35;
  box-shadow: 0 10px 30px rgba(2, 8, 20, .45);
  opacity: 0; transform: translateY(4px); pointer-events: none; transition: opacity .15s, transform .15s;
}
.toast.show { opacity: 1; transform: none; }
.toast.ok { border-color: rgba(79, 216, 255, .6); }
.toast.err { border-color: rgba(255, 122, 122, .6); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

  // Shadow DOM keeps the page's CSS out and ours in.
  const host = document.createElement('div');
  host.id = 'hyperkeypad-root';
  host.setAttribute('style', 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483646;');
  const root = host.attachShadow({ mode: 'open' });
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  const mount = document.createElement('div');
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  root.append(styleEl, mount, toastEl);

  // Stop typing inside our panel from reaching page shortcuts (some chat sites
  // grab any keystroke and move focus to their own input).
  for (const type of ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'paste', 'copy', 'cut']) {
    mount.addEventListener(type, (e) => e.stopPropagation());
  }

  function ctxOk() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (typeof v === 'boolean') el[k] = v;
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const icon = (name) => h('span', { class: 'ico', html: ICONS[name], 'aria-hidden': 'true' });

  /* ---------- storage ---------- */

  function saveButtons(list) {
    state.buttons = list;
    if (ctxOk()) chrome.storage.local.set({ [K.buttons]: list });
  }

  function saveSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    if (ctxOk()) chrome.storage.local.set({ [K.settings]: state.settings });
  }

  let settingsTimer;
  function saveSettingsSoon(patch) {
    state.settings = { ...state.settings, ...patch };
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => saveSettings({}), 300);
  }

  let layoutTimer;
  function saveLayout() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(async () => {
      if (!ctxOk()) return;
      const data = await chrome.storage.local.get(K.layout);
      const all = data[K.layout] || {};
      all[HOST] = { ...state.layout };
      await chrome.storage.local.set({ [K.layout]: all });
    }, 250);
  }

  /* ---------- layout ---------- */

  function defaultLayout() {
    const w = 300;
    const hgt = 390;
    return {
      w, h: hgt, collapsed: false,
      x: innerWidth - w - 24,
      y: innerHeight - hgt - 130,
      ox: innerWidth - ORB - 24,
      oy: innerHeight - ORB - 130
    };
  }

  const clamp = (v, lo, hi) => Math.round(Math.min(Math.max(v, lo), Math.max(lo, hi)));

  function clampLayout(L) {
    L.w = clamp(L.w, MIN_W, innerWidth - 8);
    L.h = clamp(L.h, MIN_H, innerHeight - 8);
    L.x = clamp(L.x, 0, innerWidth - L.w);
    L.y = clamp(L.y, 0, innerHeight - L.h);
    L.ox = clamp(L.ox, 0, innerWidth - ORB);
    L.oy = clamp(L.oy, 0, innerHeight - ORB);
    return L;
  }

  function bindDrag(handle, target, isOrb) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (!isOrb && e.target.closest && e.target.closest('button')) return;
      const L = state.layout;
      const sx = e.clientX;
      const sy = e.clientY;
      const bx = isOrb ? L.ox : L.x;
      const by = isOrb ? L.oy : L.y;
      let moved = false;
      handle.setPointerCapture(e.pointerId);

      const onMove = (ev) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        if (isOrb) { L.ox = bx + dx; L.oy = by + dy; } else { L.x = bx + dx; L.y = by + dy; }
        clampLayout(L);
        target.style.left = (isOrb ? L.ox : L.x) + 'px';
        target.style.top = (isOrb ? L.oy : L.y) + 'px';
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        if (moved) {
          state.justDragged = true;
          setTimeout(() => { state.justDragged = false; }, 60);
          saveLayout();
        }
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  }

  function bindResize(grip, panel) {
    grip.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const L = state.layout;
      const sx = e.clientX;
      const sy = e.clientY;
      const bw = L.w;
      const bh = L.h;
      grip.setPointerCapture(e.pointerId);
      const onMove = (ev) => {
        L.w = clamp(bw + ev.clientX - sx, MIN_W, innerWidth - L.x);
        L.h = clamp(bh + ev.clientY - sy, MIN_H, innerHeight - L.y);
        panel.style.width = L.w + 'px';
        panel.style.height = L.h + 'px';
      };
      const onUp = () => {
        grip.removeEventListener('pointermove', onMove);
        grip.removeEventListener('pointerup', onUp);
        grip.removeEventListener('pointercancel', onUp);
        saveLayout();
      };
      grip.addEventListener('pointermove', onMove);
      grip.addEventListener('pointerup', onUp);
      grip.addEventListener('pointercancel', onUp);
    });
  }

  function collapse() {
    const L = state.layout;
    L.ox = L.x + L.w - ORB;
    L.oy = L.y;
    L.collapsed = true;
    clampLayout(L);
    saveLayout();
    render();
  }

  function expand() {
    const L = state.layout;
    L.x = L.ox + ORB - L.w;
    L.y = L.oy;
    L.collapsed = false;
    state.view = 'keys';
    clampLayout(L);
    saveLayout();
    render();
  }

  /* ---------- feedback ---------- */

  let toastTimer;
  function toast(msg, kind = 'ok') {
    const L = state.layout;
    if (!L) return;
    const w = L.collapsed ? 240 : L.w;
    const left = clamp(L.collapsed ? L.ox + ORB - w : L.x, 8, innerWidth - w - 8);
    toastEl.textContent = msg;
    toastEl.className = 'toast show ' + kind;
    toastEl.style.width = w + 'px';
    toastEl.style.left = left + 'px';
    const th = toastEl.offsetHeight || 40;
    const topEdge = L.collapsed ? L.oy : L.y;
    const bottomEdge = L.collapsed ? L.oy + ORB : L.y + L.h;
    let top = bottomEdge + 8;
    if (top + th > innerHeight - 8) top = topEdge - th - 8;
    toastEl.style.top = Math.max(8, top) + 'px';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), kind === 'err' ? 4200 : 1800);
  }

  function flashKey(id) {
    const el = mount.querySelector(`.key[data-id="${CSS.escape(id)}"]`);
    if (!el) return;
    el.classList.add('fired');
    setTimeout(() => el.classList.remove('fired'), 700);
  }

  function flashArm() {
    const el = mount.querySelector('.arm');
    if (!el) return;
    el.classList.remove('fire');
    void el.offsetWidth;
    el.classList.add('fire');
  }

  /* ---------- actions ---------- */

  async function getClipboard() {
    let text = null;
    try {
      const r = await chrome.runtime.sendMessage({ type: 'hkp:readClipboard' });
      if (r && typeof r.text === 'string') text = r.text;
    } catch (_) { /* fall through */ }
    // A string (even an empty one) means the extension read the clipboard fine.
    if (text !== null) return text;
    try { return await navigator.clipboard.readText(); } catch (_) { return null; }
  }

  const FAIL = {
    noinput: 'No chat box found. Click into the chat box once, then try again.',
    insert: 'Could not type into this chat box. Click into it once, then try again.',
    notready: 'Your text is in the box. Press send when the reply finishes.'
  };

  async function deliver(text, doneMsg) {
    state.busy = true;
    try {
      const r = await S.sendText(text);
      if (r.ok) toast(doneMsg, 'ok');
      else toast(FAIL[r.reason] || 'Something went wrong. Try again.', 'err');
    } finally {
      state.busy = false;
    }
  }

  async function withClipboard(template) {
    const clip = await getClipboard();
    if (clip === null) {
      toast('Clipboard access was blocked. Allow clipboard access for this site and try again.', 'err');
      return null;
    }
    if (!clip.trim()) {
      toast('Your clipboard is empty. Copy some text first.', 'err');
      return null;
    }
    if (/\{clipboard\}/i.test(template)) return template.replace(/\{clipboard\}/gi, () => clip);
    return template.trim() ? template.trim() + '\n\n' + clip : clip;
  }

  async function runButton(b) {
    if (!ctxOk()) return teardown();
    if (state.busy) return toast('Still sending the last one.', 'err');

    if (state.settings.buttonMode === 'type') {
      const text = b.prompt.replace(/\{clipboard\}/gi, '').trim();
      flashKey(b.id);
      state.busy = true;
      try {
        const r = await S.typeText(text);
        if (r.ok) toast(`${b.label} typed`, 'ok');
        else toast(FAIL[r.reason] || 'Something went wrong. Try again.', 'err');
      } finally {
        state.busy = false;
      }
      return;
    }

    const text = await withClipboard(b.prompt);
    if (text === null) return;
    flashKey(b.id);
    await deliver(text, `${b.label} sent with clipboard`);
  }

  async function runPaste() {
    if (!ctxOk()) return teardown();
    if (state.busy) return toast('Still sending the last one.', 'err');
    const text = await withClipboard(state.settings.pasteTemplate || '{clipboard}');
    if (text === null) return;
    flashArm();
    await deliver(text, 'Clipboard sent');
  }

  function togglePaste() {
    saveSettings({ pasteMode: !state.settings.pasteMode });
    render();
  }

  function go(view) {
    state.view = view;
    state.capturing = false;
    state.confirmDelete = null;
    state.confirmReset = false;
    render();
  }

  function goBack() {
    go(state.view === 'form' ? 'edit' : 'keys');
  }

  function openForm(id) {
    state.editingId = id;
    go('form');
  }

  function moveButton(i, dir) {
    const list = [...state.buttons];
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    saveButtons(list);
    render();
  }

  function removeButton(id) {
    saveButtons(state.buttons.filter((b) => b.id !== id));
    state.confirmDelete = null;
    render();
  }

  function resetDefaults() {
    saveButtons(D.makeButtons());
    state.confirmReset = false;
    render();
    toast('Keys reset to defaults', 'ok');
  }

  const pad = (n) => String(n).padStart(2, '0');

  function downloadBackup() {
    const data = {
      app: 'HyperKeypad',
      format: 1,
      exportedAt: new Date().toISOString(),
      buttons: state.buttons.map(({ label, prompt }) => ({ label, prompt })),
      settings: {
        pasteKey: state.settings.pasteKey,
        pasteTemplate: state.settings.pasteTemplate,
        numberHotkeys: state.settings.numberHotkeys,
        buttonMode: state.settings.buttonMode
      }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const name = `hyperkeypad_backup_${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}.hkpad`;
    const a = h('a', { href: url, download: name, class: 'hidden' });
    root.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Backup downloaded', 'ok');
  }

  async function restoreFromFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.hkpad$/i.test(file.name)) return toast('Choose a .hkpad backup file.', 'err');
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== 'HyperKeypad' || !Array.isArray(data.buttons)) throw new Error('bad');
      const buttons = data.buttons
        .filter((b) => b && typeof b.label === 'string' && typeof b.prompt === 'string' && b.label.trim() && b.prompt.trim())
        .slice(0, 80)
        .map((b) => ({ id: D.uid(), label: b.label.trim().slice(0, 32), prompt: b.prompt.slice(0, 20000) }));
      const st = data.settings || {};
      const patch = {};
      if (st.pasteKey && typeof st.pasteKey.code === 'string' && typeof st.pasteKey.label === 'string') {
        patch.pasteKey = { code: st.pasteKey.code, label: st.pasteKey.label.slice(0, 14), shift: !!st.pasteKey.shift };
      }
      if (typeof st.pasteTemplate === 'string') patch.pasteTemplate = st.pasteTemplate.slice(0, 20000);
      if (typeof st.numberHotkeys === 'boolean') patch.numberHotkeys = st.numberHotkeys;
      if (st.buttonMode === 'type' || st.buttonMode === 'send') patch.buttonMode = st.buttonMode;
      saveButtons(buttons);
      saveSettings(patch);
      render();
      toast(`Restored ${buttons.length} keys`, 'ok');
    } catch (_) {
      toast('That file is not a valid HyperKeypad backup.', 'err');
    }
  }

  function keyLabel(e) {
    const names = {
      Tab: 'Tab', Space: 'Space', Enter: 'Enter', Backquote: '`', Backslash: '\\', Insert: 'Ins', Delete: 'Del',
      Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
      ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→'
    };
    let base;
    if (e.code.startsWith('Numpad')) base = 'Num ' + (e.key.length === 1 ? e.key : e.code.slice(6));
    else if (names[e.code]) base = names[e.code];
    else if (e.key.length === 1) base = e.key.toUpperCase();
    else base = e.key;
    return (e.shiftKey && e.key.length > 1 ? 'Shift ' : '') + base;
  }

  /* ---------- views ---------- */

  function renderBar(panel) {
    const titles = { edit: 'Edit keys', form: state.editingId ? 'Edit key' : 'New key', settings: 'Settings' };
    const left = state.view === 'keys'
      ? h('div', { class: 'brand' }, h('span', { class: 'mark', html: ICONS.mark }), h('span', { class: 'name' }, 'HyperKeypad'))
      : h('div', { class: 'brand' },
          h('button', { class: 'icon', title: 'Back', 'aria-label': 'Back', onclick: goBack }, icon('back')),
          h('span', { class: 'name' }, titles[state.view]));
    const right = h('div', { class: 'tools' },
      state.view === 'keys' && h('button', { class: 'icon', title: 'Edit keys', 'aria-label': 'Edit keys', onclick: () => go('edit') }, icon('edit')),
      state.view !== 'settings' && h('button', { class: 'icon', title: 'Settings', 'aria-label': 'Settings', onclick: () => go('settings') }, icon('sliders')),
      h('button', { class: 'icon', title: 'Collapse', 'aria-label': 'Collapse keypad', onclick: collapse }, icon('min')));
    const bar = h('header', { class: 'bar' }, left, right);
    bindDrag(bar, panel, false);
    return bar;
  }

  function renderArm() {
    const on = !!state.settings.pasteMode;
    const k = (state.settings.pasteKey && state.settings.pasteKey.label) || 'Tab';
    return h('button', { class: 'arm' + (on ? ' on' : ''), 'aria-pressed': String(on), onclick: togglePaste },
      h('span', { class: 'cap' }, k),
      h('span', { class: 'arm-text' },
        h('span', { class: 't1' }, 'Paste and send'),
        h('span', { class: 't2' }, on ? `On. ${k} pastes and sends` : 'Off. Click to turn on')),
      h('span', { class: 'led' }));
  }

  function renderMode() {
    const mode = state.settings.buttonMode === 'type' ? 'type' : 'send';
    const pick = (m) => {
      if (m === mode) return;
      saveSettings({ buttonMode: m });
      render();
    };
    return h('div', { class: 'mode', role: 'radiogroup', 'aria-label': 'What the keys do' },
      h('button', { class: 'seg' + (mode === 'type' ? ' active' : ''), role: 'radio', 'aria-checked': String(mode === 'type'), title: 'Keys type the prompt into the chat box without sending', onclick: () => pick('type') }, 'Type only'),
      h('button', { class: 'seg' + (mode === 'send' ? ' active' : ''), role: 'radio', 'aria-checked': String(mode === 'send'), title: 'Keys add your clipboard after the prompt and send both', onclick: () => pick('send') }, 'Send + clipboard'));
  }

  function renderKeys() {
    const wrap = h('div', { class: 'keys' });
    if (!state.buttons.length) {
      wrap.append(h('div', { class: 'empty' },
        h('p', {}, 'No keys yet.'),
        h('button', { class: 'btn primary', onclick: () => openForm(null) }, icon('plus'), 'Add a key')));
      return wrap;
    }
    state.buttons.forEach((b, i) => {
      wrap.append(h('button', { class: 'key', 'data-id': b.id, title: b.prompt.slice(0, 280), onclick: () => runButton(b) },
        state.settings.numberHotkeys && i < 9 && h('span', { class: 'legend' }, String(i + 1)),
        h('span', { class: 'label' }, b.label)));
    });
    return wrap;
  }

  function renderEdit() {
    const list = h('div', { class: 'list' });
    state.buttons.forEach((b, i) => {
      const confirming = state.confirmDelete === b.id;
      list.append(h('div', { class: 'row' },
        h('span', { class: 'idx' }, String(i + 1)),
        h('span', { class: 'row-name', title: b.label }, b.label),
        h('button', { class: 'icon sm', title: 'Move up', 'aria-label': `Move ${b.label} up`, disabled: i === 0, onclick: () => moveButton(i, -1) }, icon('up')),
        h('button', { class: 'icon sm', title: 'Move down', 'aria-label': `Move ${b.label} down`, disabled: i === state.buttons.length - 1, onclick: () => moveButton(i, 1) }, icon('down')),
        h('button', { class: 'icon sm', title: 'Edit', 'aria-label': `Edit ${b.label}`, onclick: () => openForm(b.id) }, icon('edit')),
        confirming
          ? h('button', { class: 'btn danger xs', onclick: () => removeButton(b.id) }, 'Delete')
          : h('button', { class: 'icon sm', title: 'Delete', 'aria-label': `Delete ${b.label}`, onclick: () => { state.confirmDelete = b.id; render(); } }, icon('trash'))));
    });
    return h('div', { class: 'pane' },
      state.buttons.length ? list : h('p', { class: 'hint' }, 'No keys yet. Add one to get started.'),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: () => openForm(null) }, icon('plus'), 'Add key'),
        h('button', { class: 'btn ghost', onclick: () => go('keys') }, 'Done')));
  }

  function renderForm() {
    const existing = state.buttons.find((x) => x.id === state.editingId);
    const b = existing || { label: '', prompt: '' };
    const label = h('input', { type: 'text', maxlength: '32', value: b.label, placeholder: 'Next topic' });
    const prompt = h('textarea', { rows: '7', value: b.prompt, placeholder: "Let's move on to the next topic." });
    const err = h('p', { class: 'error', role: 'alert' });

    const save = () => {
      const L = label.value.trim();
      const P = prompt.value.trim();
      if (!L || !P) { err.textContent = 'Add a label and a prompt to save this key.'; return; }
      if (existing) saveButtons(state.buttons.map((x) => (x.id === existing.id ? { ...x, label: L, prompt: P } : x)));
      else saveButtons([...state.buttons, { id: D.uid(), label: L, prompt: P }]);
      go('edit');
    };

    setTimeout(() => label.focus(), 0);

    return h('div', { class: 'pane' },
      h('label', { class: 'field' }, h('span', {}, 'Label'), label),
      h('label', { class: 'field' }, h('span', {}, 'Prompt'), prompt),
      h('p', { class: 'hint' }, 'In Send + clipboard mode, your copied text is added after this prompt. In Type only mode, just the prompt is typed.'),
      err,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: save }, 'Save key'),
        h('button', { class: 'btn ghost', onclick: goBack }, 'Cancel')));
  }

  function renderSettings() {
    const s = state.settings;
    const fileIn = h('input', { type: 'file', accept: '.hkpad', class: 'hidden', onchange: restoreFromFile });
    const template = h('textarea', { rows: '3', value: s.pasteTemplate, oninput: (e) => saveSettingsSoon({ pasteTemplate: e.target.value }) });

    return h('div', { class: 'pane' },
      h('div', { class: 'group' },
        h('h3', {}, 'Paste and send'),
        h('div', { class: 'keyrow' },
          h('span', { class: 'cap' + (state.capturing ? ' listening' : '') }, state.capturing ? 'Press a key' : s.pasteKey.label),
          state.capturing
            ? h('button', { class: 'btn ghost xs', onclick: () => { state.capturing = false; render(); } }, 'Cancel')
            : h('button', { class: 'btn xs', onclick: () => { state.capturing = true; render(); } }, 'Change key')),
        h('p', { class: 'hint' }, 'While paste mode is on, this key pastes your clipboard and sends it. Pick a key you rarely type.'),
        h('label', { class: 'field' }, h('span', {}, 'Paste template'), template),
        h('p', { class: 'hint' }, '{clipboard} becomes your copied text. Add words around it to wrap every paste, like "Explain this: {clipboard}".')),
      h('div', { class: 'group' },
        h('h3', {}, 'Keys'),
        h('label', { class: 'check' },
          h('input', { type: 'radio', name: 'hkp-mode', checked: s.buttonMode === 'type', onchange: () => saveSettings({ buttonMode: 'type' }) }),
          h('span', {}, 'Type only: put the prompt in the chat box without sending')),
        h('label', { class: 'check' },
          h('input', { type: 'radio', name: 'hkp-mode', checked: s.buttonMode !== 'type', onchange: () => saveSettings({ buttonMode: 'send' }) }),
          h('span', {}, 'Send + clipboard: add your copied text after the prompt and send'))),
      h('div', { class: 'group' },
        h('h3', {}, 'Shortcuts'),
        h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: !!s.numberHotkeys, onchange: (e) => saveSettings({ numberHotkeys: e.target.checked }) }),
          h('span', {}, 'Alt + 1 to 9 presses your first nine keys, using the mode above')),
        h('p', { class: 'hint' }, 'Alt + Shift + K shows or hides the keypad. Alt + Shift + P turns paste mode on or off. Change them at chrome://extensions/shortcuts.')),
      h('div', { class: 'group' },
        h('h3', {}, 'Backup'),
        h('div', { class: 'inline' },
          h('button', { class: 'btn xs', onclick: downloadBackup }, 'Download backup'),
          h('button', { class: 'btn xs', onclick: () => fileIn.click() }, 'Restore backup'),
          fileIn),
        h('p', { class: 'hint' }, 'Backups save as .hkpad files. Restore only opens .hkpad files, so yours are easy to find.')),
      h('div', { class: 'group' },
        h('h3', {}, 'Reset'),
        state.confirmReset
          ? h('div', { class: 'inline' },
              h('button', { class: 'btn danger xs', onclick: resetDefaults }, 'Yes, reset my keys'),
              h('button', { class: 'btn ghost xs', onclick: () => { state.confirmReset = false; render(); } }, 'Cancel'))
          : h('div', { class: 'inline' },
              h('button', { class: 'btn ghost xs', onclick: () => { state.confirmReset = true; render(); } }, 'Reset keys to defaults'))));
  }

  function renderOrb() {
    const L = state.layout;
    const orb = h('button', {
      class: 'orb' + (state.settings.pasteMode ? ' on' : ''),
      title: 'Open HyperKeypad',
      'aria-label': 'Open HyperKeypad',
      onclick: () => { if (!state.justDragged) expand(); }
    }, h('span', { class: 'mark', html: ICONS.mark }), h('span', { class: 'led' }));
    orb.style.left = L.ox + 'px';
    orb.style.top = L.oy + 'px';
    bindDrag(orb, orb, true);
    return orb;
  }

  function render() {
    if (!alive || !state.layout) return;
    host.style.display = state.settings.panelVisible ? '' : 'none';
    mount.replaceChildren();
    if (!state.settings.panelVisible) return;

    const L = state.layout;
    if (L.collapsed) {
      mount.append(renderOrb());
      return;
    }

    const panel = h('section', { class: 'panel', 'aria-label': 'HyperKeypad' });
    panel.style.left = L.x + 'px';
    panel.style.top = L.y + 'px';
    panel.style.width = L.w + 'px';
    panel.style.height = L.h + 'px';
    panel.append(renderBar(panel));
    if (state.view === 'keys') panel.append(renderArm(), renderMode(), renderKeys());
    else if (state.view === 'edit') panel.append(renderEdit());
    else if (state.view === 'form') panel.append(renderForm());
    else panel.append(renderSettings());
    const grip = h('div', { class: 'grip', title: 'Resize', 'aria-hidden': 'true' });
    bindResize(grip, panel);
    panel.append(grip);
    mount.append(panel);
  }

  /* ---------- global keys ---------- */

  function onKey(e) {
    if (!alive) return;

    if (state.capturing) {
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      state.capturing = false;
      if (e.code !== 'Escape') saveSettings({ pasteKey: { code: e.code, label: keyLabel(e), shift: e.shiftKey } });
      render();
      return;
    }

    if (e.isComposing || e.composedPath().includes(host)) return;
    const s = state.settings;
    if (!s.panelVisible) return;

    const pk = s.pasteKey || {};
    const pasteHit = s.pasteMode && e.code === pk.code && e.shiftKey === !!pk.shift && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (pasteHit) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) runPaste();
      return;
    }

    if (s.numberHotkeys && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      const b = state.buttons[Number(e.code.slice(5)) - 1];
      if (!b) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) runButton(b);
    }
  }

  function onResize() {
    if (!state.layout) return;
    clampLayout(state.layout);
    render();
  }

  function onStorage(changes, area) {
    if (area !== 'local' || !alive) return;
    let changed = false;
    if (changes[K.buttons]) { state.buttons = changes[K.buttons].newValue || []; changed = true; }
    if (changes[K.settings]) { state.settings = { ...D.settings, ...(changes[K.settings].newValue || {}) }; changed = true; }
    if (!changed) return;
    // Do not rebuild forms while someone is typing in them.
    if (state.view === 'keys' || state.view === 'edit' || state.layout.collapsed || !state.settings.panelVisible) render();
    else host.style.display = state.settings.panelVisible ? '' : 'none';
  }

  function onMessage(msg) {
    if (msg && msg.type === 'hkp:teardown') teardown();
  }

  let keepAlive = null;

  function teardown() {
    if (!alive) return;
    alive = false;
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', onResize);
    clearInterval(keepAlive);
    try { chrome.storage.onChanged.removeListener(onStorage); } catch (_) { /* context gone */ }
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch (_) { /* context gone */ }
    S.unwatchFocus();
    host.remove();
    globalThis.__HKP_LOADED = false;
  }

  async function loadFonts() {
    try {
      const faces = await chrome.runtime.sendMessage({ type: 'hkp:getFonts' });
      for (const f of faces || []) {
        const bin = atob(f.data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const face = new FontFace(f.family, bytes.buffer, { weight: String(f.weight) });
        await face.load();
        document.fonts.add(face);
      }
    } catch (_) { /* fallback fonts are fine */ }
  }

  async function init() {
    const data = await chrome.storage.local.get([K.buttons, K.settings, K.layout]);
    let buttons = data[K.buttons];
    if (!Array.isArray(buttons)) {
      buttons = D.makeButtons();
      await chrome.storage.local.set({ [K.buttons]: buttons });
    }
    state.buttons = buttons;
    state.settings = { ...D.settings, ...(data[K.settings] || {}) };
    state.layout = clampLayout({ ...defaultLayout(), ...((data[K.layout] || {})[HOST] || {}) });

    document.documentElement.appendChild(host);
    S.watchFocus(host);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);

    keepAlive = setInterval(() => {
      if (!ctxOk()) return teardown();
      if (!host.isConnected) document.documentElement.appendChild(host);
    }, 2000);

    render();
    loadFonts();
  }

  init().catch(() => teardown());
})();
