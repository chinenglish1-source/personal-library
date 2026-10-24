(() => {
  const $ = id => document.getElementById(id);
  const welcome = $('app-welcome'), instructions = $('install-steps');
  const standaloneQuery = matchMedia('(display-mode: standalone)');
  const inApp = () => standaloneQuery.matches || matchMedia('(display-mode: fullscreen)').matches || !!navigator.standalone;
  const dismissWelcome = () => { if (welcome.open) welcome.close(); };
  const showWelcome = () => { if (!inApp() && !welcome.open && !instructions.open) welcome.showModal(); };
  let installPrompt;
  $('welcome-read').addEventListener('click', dismissWelcome);
  $('close-install-steps').addEventListener('click', () => instructions.close());
  function showInstallSteps() {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    $('install-instructions').textContent = ios
      ? 'Open this link in Safari. Tap Share → Add to Home Screen → Add. Turn on Open as Web App if shown.'
      : android
        ? 'Open this link in Chrome. Tap ⋮ → Install app or Add to Home screen, then confirm. If you opened it inside a chat app, open it in Chrome first.'
        : 'Use your browser’s Install app option. On a phone, open this link in Safari (iPhone) or Chrome (Android), then choose Add to Home Screen from its menu.';
    instructions.showModal();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event;
  });
  $('welcome-install').addEventListener('click', async () => {
    dismissWelcome();
    if (!installPrompt) { showInstallSteps(); return; }
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { showInstallSteps(); }
  });
  window.addEventListener('appinstalled', () => {
    dismissWelcome(); if (instructions.open) instructions.close();
  });
  standaloneQuery.addEventListener('change', () => { if (inApp()) { dismissWelcome(); if (instructions.open) instructions.close(); } });
  window.addEventListener('pageshow', event => { if (event.persisted) showWelcome(); });
  showWelcome();
  const message = text => { $('app-message').textContent = text; $('app-message').hidden = false; };
  window.addEventListener('offline', () => message('You’re offline. Books need internet unless you downloaded a copy.'));
  window.addEventListener('online', () => { $('app-message').hidden = true; });
  if (!navigator.onLine) message('You’re offline. Books need internet unless you downloaded a copy.');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js?v=39', {updateViaCache:'none'}).catch(() => {});
})();

if (matchMedia("(display-mode: standalone)").matches || navigator.standalone) location.hash = "ar-study";
