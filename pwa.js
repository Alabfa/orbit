'use strict';

/* Browser capabilities decide whether to offer a native prompt or manual steps. */
const PWA = (() => {
  let deferredPrompt = null, installed = false, pending = false, offline = 'loading';
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const standalone = () => displayMode.matches || navigator.standalone === true;
  const notify = () => window.dispatchEvent(new Event('pwa-statechange'));

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    notify();
  });
  displayMode.addEventListener('change', notify);

  async function prompt() {
    if (!deferredPrompt || pending || installed || standalone()) return 'unavailable';
    const event = deferredPrompt;
    deferredPrompt = null;
    pending = true;
    notify();
    try {
      // Keep this call in the user's click handler; do not await registration first.
      await event.prompt();
      const { outcome } = await event.userChoice;
      if (outcome === 'accepted') installed = true;
      return outcome;
    } catch {
      return 'unavailable';
    } finally {
      pending = false;
      notify();
    }
  }

  window.addEventListener('load', async () => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext || !/^https?:$/.test(location.protocol)) {
      offline = 'unavailable';
      notify();
      return;
    }
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
      if (!registration.active) {
        const worker = registration.installing || registration.waiting;
        await new Promise((resolve, reject) => {
          if (!worker) return reject(new Error('No service worker'));
          const check = () => {
            if (worker.state === 'activated') resolve();
            else if (worker.state === 'redundant') reject(new Error('Offline installation failed'));
          };
          worker.addEventListener('statechange', check);
          check();
        });
      }
      offline = 'ready';
    } catch {
      offline = 'unavailable';
    }
    notify();
  });

  return {
    get installed() { return installed || standalone(); },
    get canPrompt() { return !!deferredPrompt && !installed && !standalone(); },
    get pending() { return pending; },
    get offline() { return offline; },
    platform() {
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
      return /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
    },
    prompt
  };
})();
