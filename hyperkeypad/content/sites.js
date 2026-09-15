(() => {
  if (globalThis.HKP_SITES) return;

  // Known layouts. Anything not listed here, or any selector that stops
  // working after a site update, falls back to the generic finder below.
  const ADAPTERS = [
    {
      hosts: ['claude.ai'],
      input: ['div.ProseMirror[contenteditable="true"]'],
      send: ['button[aria-label="Send message"]', 'button[aria-label*="Send" i]']
    },
    {
      hosts: ['chatgpt.com', 'chat.openai.com'],
      input: ['#prompt-textarea[contenteditable="true"]', '#prompt-textarea', 'div.ProseMirror[contenteditable="true"]'],
      send: ['button[data-testid="send-button"]', '#composer-submit-button']
    },
    {
      hosts: ['gemini.google.com'],
      input: ['rich-textarea .ql-editor[contenteditable="true"]', '.ql-editor[contenteditable="true"]'],
      send: ['button.send-button', 'button[aria-label*="Send" i]']
    },
    {
      hosts: ['aistudio.google.com'],
      input: ['ms-prompt-input-wrapper textarea', 'textarea[aria-label*="prompt" i]', 'footer textarea'],
      send: ['button.run-button', 'button[aria-label="Run"]']
    },
    {
      hosts: ['grok.com'],
      input: ['div.ProseMirror[contenteditable="true"]', 'textarea'],
      send: ['button[type="submit"][aria-label="Submit"]', 'button[type="submit"]']
    },
    {
      hosts: ['chat.deepseek.com'],
      input: ['textarea#chat-input', 'textarea'],
      send: [],
      sendWithEnter: true
    },
    {
      hosts: ['kimi.com', 'kimi.moonshot.cn'],
      input: ['.chat-input-editor[contenteditable="true"]', 'div[contenteditable="true"]'],
      send: ['.send-button']
    },
    {
      hosts: ['chat.mistral.ai'],
      input: ['div.ProseMirror[contenteditable="true"]', 'textarea'],
      send: ['button[type="submit"]', 'button[aria-label*="Send" i]']
    },
    {
      hosts: ['perplexity.ai'],
      input: ['#ask-input', 'div[contenteditable="true"][role="textbox"]', 'textarea'],
      send: ['button[data-testid="submit-button"]', 'button[aria-label="Submit"]']
    },
    {
      hosts: ['chat.qwen.ai'],
      input: ['textarea#chat-input', 'textarea'],
      send: ['#send-message-button', 'button[aria-label*="Send" i]']
    },
    {
      hosts: ['copilot.microsoft.com'],
      input: ['textarea#userInput', 'textarea'],
      send: ['button[aria-label="Submit message"]', 'button[aria-label*="Submit" i]']
    }
  ];

  const HOST = location.hostname;
  const adapter = ADAPTERS.find((a) => a.hosts.some((h) => HOST === h || HOST.endsWith('.' + h))) || null;

  // Words that mark a button as a send button, and words that mark one we must never click.
  const GOOD = /send|submit|发送|送信|enviar|envoyer|senden|invia/i;
  const BAD = /stop|cancel|attach|upload|voice|dictat|micro|record|speech|model|menu|more|option|setting|share|copy|edit|regenerat|retry/i;

  let ownHost = null;
  let lastFocused = null;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  function insideOwn(el) {
    return !!ownHost && (el === ownHost || ownHost.contains(el));
  }

  function outermostEditable(el) {
    let node = el;
    while (node.parentElement && node.parentElement.isContentEditable) node = node.parentElement;
    return node;
  }

  function editableRoot(el) {
    if (!el || !(el instanceof Element)) return null;
    if (el.tagName === 'TEXTAREA') return el.readOnly || el.disabled ? null : el;
    if (el.isContentEditable) return outermostEditable(el);
    return null;
  }

  function onFocusIn(e) {
    const path = e.composedPath();
    if (ownHost && path.includes(ownHost)) return;
    const el = editableRoot(path[0]);
    if (el) lastFocused = el;
  }

  function score(el) {
    const r = el.getBoundingClientRect();
    let s = Math.min(r.width, 900) + (r.bottom / Math.max(innerHeight, 1)) * 500;
    if (el === document.activeElement || el.contains(document.activeElement)) s += 5000;
    if (el === lastFocused) s += 2000;
    return s;
  }

  function pickBest(list) {
    const unique = [...new Set(list)].filter((el) => visible(el) && editableRoot(el) && !insideOwn(el));
    unique.sort((a, b) => score(b) - score(a));
    return unique[0] || null;
  }

  function findComposer() {
    if (adapter) {
      for (const sel of adapter.input) {
        const hit = pickBest([...document.querySelectorAll(sel)].map((e) => editableRoot(e) || e));
        if (hit) return hit;
      }
    }
    if (lastFocused && lastFocused.isConnected && visible(lastFocused)) return lastFocused;
    const all = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]')]
      .map((e) => editableRoot(e))
      .filter((e) => e && e.getBoundingClientRect().width >= 160);
    return pickBest(all);
  }

  function placeCaretAtEnd(el) {
    el.focus({ preventScroll: true });
    if (el.tagName === 'TEXTAREA') {
      const n = el.value.length;
      el.setSelectionRange(n, n);
      return;
    }
    const sel = getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function snapshot(el) {
    return el.tagName === 'TEXTAREA' ? el.value : el.innerHTML;
  }

  // Some editors update the box a moment after the paste, so keep checking briefly.
  async function changedWithin(el, before, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (!el.isConnected || snapshot(el) !== before) return true;
      await sleep(40);
    }
    return snapshot(el) !== before;
  }

  // Returns 'ok' when the text is confirmed in the box, or 'unsure' when it could not be confirmed.
  async function insertText(el, text) {
    placeCaretAtEnd(el);
    await sleep(16);

    if (el.tagName === 'TEXTAREA') {
      const before = el.value;
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (_) { ok = false; }
      if (!ok || el.value === before) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        setter.call(el, before + text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return 'ok';
    }

    // Rich editors (ProseMirror, Quill, Lexical) handle a paste event cleanly,
    // including multi line text, so try that first.
    const before = snapshot(el);
    let handled = false;
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      handled = ev.defaultPrevented;
    } catch (_) { handled = false; }

    if (handled) return 'ok';

    // Editors like Gemini's take the paste without marking it handled. They move the
    // focus to a hidden box and copy its contents into the chat box on a short timer,
    // so the typed text shows up a moment later instead of right away.
    try { document.execCommand('insertText', false, text); } catch (_) { /* ignore */ }
    return (await changedWithin(el, before, 800)) ? 'ok' : 'unsure';
  }

  function primaryLabel(b) {
    return [b.getAttribute('aria-label'), b.getAttribute('title'), b.getAttribute('data-testid')].filter(Boolean).join(' ');
  }

  function fullLabel(b) {
    const cls = typeof b.className === 'string' ? b.className : '';
    return [primaryLabel(b), b.id, cls].filter(Boolean).join(' ');
  }

  function isEnabled(b) {
    return !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !b.classList.contains('disabled');
  }

  function findSendButton(composer) {
    if (adapter) {
      for (const sel of adapter.send) {
        const hit = [...document.querySelectorAll(sel)].find((b) => visible(b) && !insideOwn(b) && !BAD.test(primaryLabel(b)));
        if (hit) return hit;
      }
    }
    let node = composer;
    for (let i = 0; i < 8 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const buttons = [...node.querySelectorAll('button, [role="button"]')].filter((b) => visible(b) && !insideOwn(b));
      const hit = buttons.find((b) => GOOD.test(fullLabel(b)) && !BAD.test(primaryLabel(b)));
      if (hit) return hit;
      if (node.tagName === 'FORM') {
        const submit = node.querySelector('button[type="submit"]');
        if (submit && visible(submit) && !BAD.test(primaryLabel(submit))) return submit;
      }
    }
    return null;
  }

  function pressEnter(el) {
    for (const type of ['keydown', 'keypress', 'keyup']) {
      el.dispatchEvent(new KeyboardEvent(type, {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
        bubbles: true, cancelable: true, composed: true
      }));
    }
  }

  async function sendText(text) {
    let composer = findComposer();
    if (!composer) return { ok: false, reason: 'noinput' };

    // Even when the text cannot be confirmed, still try to send: if it did land,
    // the send button will be ready.
    const inserted = await insertText(composer, text);

    await sleep(140);
    if (!composer.isConnected) composer = findComposer() || composer;

    if (adapter && adapter.sendWithEnter) {
      pressEnter(composer);
      return { ok: true };
    }

    const started = Date.now();
    let sawButton = false;
    while (Date.now() - started < 6000) {
      const current = composer.isConnected ? composer : (findComposer() || composer);
      const btn = findSendButton(current);
      if (btn) {
        sawButton = true;
        if (isEnabled(btn)) {
          btn.click();
          return { ok: true };
        }
      } else if (!sawButton && Date.now() - started > 1200) {
        pressEnter(current);
        return { ok: true };
      }
      await sleep(80);
    }
    return { ok: false, reason: inserted === 'unsure' ? 'insert' : 'notready' };
  }

  async function typeText(text) {
    const composer = findComposer();
    if (!composer) return { ok: false, reason: 'noinput' };
    const existing = composer.tagName === 'TEXTAREA' ? composer.value : composer.textContent;
    const prefix = existing && existing.trim() && !/\s$/.test(existing) ? ' ' : '';
    const inserted = await insertText(composer, prefix + text);
    return inserted === 'ok' ? { ok: true } : { ok: false, reason: 'insert' };
  }

  function watchFocus(hostEl) {
    ownHost = hostEl;
    document.addEventListener('focusin', onFocusIn, true);
  }

  function unwatchFocus() {
    document.removeEventListener('focusin', onFocusIn, true);
    ownHost = null;
    lastFocused = null;
  }

  globalThis.HKP_SITES = { sendText, typeText, findComposer, watchFocus, unwatchFocus };
})();
