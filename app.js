(() => {
  const $ = id => document.getElementById(id);
  const publicURL = 'https://chinenglish1-source.github.io/personal-library/';
  const help = $('app-help');
  const message = text => { $('app-message').textContent = text; $('app-message').hidden = false; };
  let installPrompt;
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
  $('install-library').addEventListener('click', async () => {
    if (!installPrompt) { help.showModal(); return; }
    const prompt = installPrompt; installPrompt = null;
    try { await prompt.prompt(); await prompt.userChoice; }
    catch { help.showModal(); }
    $('install-library').textContent = 'Add to phone';
  });
  window.addEventListener('appinstalled', () => { $('install-library').hidden = true; message('Library installed. Open it from your home screen.'); });
  window.addEventListener('offline', () => message('You’re offline. Browse the catalogue; books need internet unless you downloaded a copy.'));
  window.addEventListener('online', () => { $('app-message').hidden = true; });
  if (!navigator.onLine) message('You’re offline. Browse the catalogue; books need internet unless you downloaded a copy.');
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => message('Offline catalogue unavailable. You can still read online.'));
})();
