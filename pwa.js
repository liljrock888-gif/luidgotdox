/* LuidgotDOx: install-as-app support */
(function () {
  'use strict';
  const { $, toast, modal } = window.FS;

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }

  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return; // already running as an app

  const btn = document.createElement('button');
  btn.className = 'btn sm primary'; btn.id = 'installBtn'; btn.textContent = 'Install app'; btn.hidden = true;
  $('#backupBtn').before(btn);

  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; deferred = null; toast('Installed! Open LuidgotDOx from your home screen or apps.'); });

  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safariMac = /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua) && !iOS;
  if (iOS || safariMac) btn.hidden = false; // no automatic prompt there, so we show instructions

  btn.onclick = async () => {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') btn.hidden = true;
      return;
    }
    if (iOS) {
      modal('Install on iPhone / iPad',
        '<ol><li>Tap the <b>Share</b> button in Safari (the square with an arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol><p class="hint">LuidgotDOx then opens full-screen like a normal app and works offline.</p>', { cancel: null, ok: 'Got it' });
    } else if (safariMac) {
      modal('Install on Mac', '<ol><li>In Safari\'s menu bar click <b>File</b>.</li><li>Click <b>Add to Dock</b>.</li></ol>', { cancel: null, ok: 'Got it' });
    } else {
      modal('Install the app', '<p>Open this site in <b>Chrome</b> or <b>Edge</b> and click the install icon in the address bar, or use the browser menu: <b>Install LuidgotDOx</b>.</p>', { cancel: null, ok: 'Got it' });
    }
  };
})();
