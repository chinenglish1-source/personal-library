(() => {
  const $ = id => document.getElementById(id);
  const publicURL = 'https://chinenglish1-source.github.io/personal-library/';
  const help = $('app-help');
  const message = text => { $('app-message').textContent = text; $('app-message').hidden = false; };
  let installPrompt;
  const welcome = $('app-welcome');
  const choiceKey = 'my-library.read-on-web';
  const rememberChoice = () => { try { localStorage.setItem(choiceKey, 'yes'); } catch {} };
  const dismissWelcome = () => { rememberChoice(); if (welcome.open) welcome.close(); };
  $('welcome-read').addEventListener('click', dismissWelcome);
  welcome.addEventListener('cancel', rememberChoice);
  function showInstallSteps() {
    const ua = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const android = /Android/.test(ua);
    const steps = ios
      ? 'On iPhone or iPad: open this link in Safari. Tap Share → Add to Home Screen → Add. Turn on Open as Web App if shown.'
      : android
        ? 'Open this link in Chrome. Tap ⋮ → Install app or Add to Home screen, then confirm. If you opened it inside a chat app, open it in Chrome first.'
        : 'Use your browser’s Install app option in its address bar or menu. On a phone, open this link in Safari (iPhone) or Chrome (Android).';
    $('welcome-steps').textContent = steps;
    $('welcome-steps').hidden = false;
    if (!welcome.open) welcome.showModal();
  }
  async function requestInstall() {
    if (!installPrompt) { showInstallSteps(); return; }
    const prompt = installPrompt; installPrompt = null;
    try {
      await prompt.prompt();
      const result = await prompt.userChoice;
      if (result.outcome === 'accepted') dismissWelcome();
    } catch { showInstallSteps(); }
    $('install-library').textContent = 'Add to phone';
  }
  $('welcome-install').addEventListener('click', requestInstall);
  $('library-help').addEventListener('click', () => help.showModal());
  $('close-app-help').addEventListener('click', () => help.close());
  $('library-link').addEventListener('click', event => event.target.select());
  $('share-library').addEventListener('click', async () => {
    const data = { title: 'My Library', text: 'Books and documents to read and download.', url: publicURL };
    try {
      if (navigator.share) { await navigator.share(data); return; }
      if (navigator.clipboard) { await navigator.clipboard.writeText(publicURL); message('Library link copied. Paste it into any chat.'); return; }
      help.showModal(); $('library-link').select();
    } catch (error) {
      if (error.name !== 'AbortError') { help.showModal(); $('library-link').select(); }
    }
  });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  $('install-library').hidden = !!standalone;
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event;
    if (!standalone) { $('install-library').hidden = false; $('install-library').textContent = 'Install app'; }
  });
  $('install-library').addEventListener('click', requestInstall);
  let choseWebsite = false;
  try { choseWebsite = localStorage.getItem(choiceKey) === 'yes'; } catch {}
  if (!standalone && !choseWebsite) welcome.showModal();
  window.addEventListener('appinstalled', () => { dismissWelcome(); $('install-library').hidden = true; message('Library installed. Open it from your home screen.'); });
  window.addEventListener('offline', () => message('You’re offline. Browse the catalogue; books need internet unless you downloaded a copy.'));
  window.addEventListener('online', () => { $('app-message').hidden = true; });
  if (!navigator.onLine) message('You’re offline. Browse the catalogue; books need internet unless you downloaded a copy.');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => message('Offline catalogue unavailable. You can still read online.'));
})();
