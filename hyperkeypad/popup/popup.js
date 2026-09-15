(async () => {
  const D = globalThis.HKP_DEFAULTS;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\\/]/g, '\\$&');

  function patternToRegex(p) {
    const m = /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(p);
    if (!m) return null;
    const scheme = m[1] === '*' ? 'https?' : m[1];
    let hostRe;
    if (m[2] === '*') hostRe = '[^/]+';
    else if (m[2].startsWith('*.')) hostRe = '(?:[^/]+\\.)?' + esc(m[2].slice(2));
    else hostRe = esc(m[2]);
    const path = m[3].split('*').map(esc).join('.*');
    return new RegExp('^' + scheme + ':\\/\\/' + hostRe + '(?::\\d+)?' + path + '$');
  }

  const builtIn = (chrome.runtime.getManifest().content_scripts || [])
    .flatMap((c) => c.matches)
    .map(patternToRegex)
    .filter(Boolean);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url = null;
  try { url = tab && tab.url ? new URL(tab.url) : null; } catch (_) { url = null; }
  const webPage = !!url && /^https?:$/.test(url.protocol);
  const pattern = webPage ? `${url.protocol}//${url.hostname}/*` : null;

  let { hkp_settings, hkp_custom_sites = [] } = await chrome.storage.local.get(['hkp_settings', 'hkp_custom_sites']);
  let settings = { ...D.settings, ...(hkp_settings || {}) };

  function renderToggles() {
    $('visible').checked = !!settings.panelVisible;
    $('paste').checked = !!settings.pasteMode;
    const label = (settings.pasteKey && settings.pasteKey.label) || 'Tab';
    $('keyHint').textContent = `Press ${label} to paste and send`;
    const sendMode = settings.buttonMode !== 'type';
    $('mode').checked = sendMode;
    $('modeHint').textContent = sendMode ? 'Keys add your copied text and send' : 'Off: keys only type the prompt';
  }

  function renderSite() {
    const host = $('host');
    const status = $('status');
    const hint = $('siteHint');
    const btn = $('siteBtn');
    btn.hidden = true;
    btn.className = 'btn';
    status.className = 'status';

    if (!webPage) {
      host.textContent = 'This page';
      status.textContent = 'Not available';
      hint.textContent = 'The keypad runs on regular websites, not browser pages.';
      return;
    }

    host.textContent = url.hostname;
    if (builtIn.some((re) => re.test(url.href))) {
      status.textContent = 'Built in';
      status.className = 'status live';
      hint.textContent = 'The keypad runs here automatically.';
    } else if (hkp_custom_sites.includes(pattern)) {
      status.textContent = 'Added';
      status.className = 'status live';
      hint.textContent = '';
      btn.textContent = 'Remove this site';
      btn.className = 'btn remove';
      btn.hidden = false;
    } else {
      status.textContent = 'Not added';
      hint.textContent = 'Using another AI chat? Add this site and the keypad will show up here.';
      btn.textContent = 'Add this site';
      btn.hidden = false;
    }
  }

  async function saveSettings(patch) {
    const current = (await chrome.storage.local.get('hkp_settings')).hkp_settings || {};
    settings = { ...D.settings, ...current, ...patch };
    await chrome.storage.local.set({ hkp_settings: settings });
    renderToggles();
  }

  $('visible').addEventListener('change', (e) => saveSettings({ panelVisible: e.target.checked }));
  $('paste').addEventListener('change', (e) => saveSettings({ pasteMode: e.target.checked }));
  $('mode').addEventListener('change', (e) => saveSettings({ buttonMode: e.target.checked ? 'send' : 'type' }));
  $('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

  $('siteBtn').addEventListener('click', async () => {
    if (!pattern) return;
    if (hkp_custom_sites.includes(pattern)) {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'hkp:teardown' }); } catch (_) { /* not running */ }
      await chrome.permissions.remove({ origins: [pattern] });
    } else {
      const granted = await chrome.permissions.request({ origins: [pattern] });
      if (!granted) $('siteHint').textContent = 'Permission was not granted, so the keypad was not added.';
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.hkp_settings) {
      settings = { ...D.settings, ...(changes.hkp_settings.newValue || {}) };
      renderToggles();
    }
    if (changes.hkp_custom_sites) {
      hkp_custom_sites = changes.hkp_custom_sites.newValue || [];
      renderSite();
    }
  });

  renderToggles();
  renderSite();
})();
