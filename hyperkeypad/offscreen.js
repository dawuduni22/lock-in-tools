// Reads the clipboard for the service worker, since workers cannot touch it directly.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen' || msg.type !== 'read-clipboard') return false;
  const box = document.getElementById('buffer');
  box.value = '';
  box.focus();
  let ok = false;
  try { ok = document.execCommand('paste'); } catch (_) { ok = false; }
  sendResponse({ text: ok ? box.value : null });
  return false;
});
