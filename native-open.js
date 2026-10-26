(() => {
  const params = new URLSearchParams(location.search), id = params.get('file') || '';
  const status = document.getElementById('status'), progress = document.getElementById('progress');
  const retry = document.getElementById('retry'), cancel = document.getElementById('cancel');
  document.getElementById('title').textContent = params.get('title') || 'Opening PDF';
  let controller, running = false;
  async function open() {
    if (running) return;
    running = true; controller = new AbortController(); retry.hidden = true; cancel.hidden = false;
    progress.hidden = false; progress.removeAttribute('value');
    status.textContent = 'Preparing for your device’s PDF viewer…';
    try {
      let blob;
      if (/^local:[0-9a-f-]{36}$/i.test(id)) {
        const bytes = await DeviceLibrary.read(id);
        if (!bytes) throw Error('This PDF is not stored in this browser. Open it from the device where you added it.');
        blob = new Blob([bytes],{type:'application/pdf'});
      } else {
        const file = NATIVE_FILES[id];
        if (!file) throw Error('PDF not found. Return to the library and try again.');
        status.textContent = 'Preparing this large PDF… 0%';
        let received = 0, next = 0;
        const parts = new Array(file.parts.length);
        await Promise.all(Array.from({length:Math.min(3,file.parts.length)},async()=>{
          while(next < file.parts.length) {
            const index = next++;
            const response = await fetch(file.parts[index],{signal:controller.signal});
            if(!response.ok)throw Error('Could not load this PDF. Check your connection and retry.');
            const reader = response.body.getReader(), chunks = [];
            for (;;) {
              const {done,value} = await reader.read(); if(done)break;
              chunks.push(value);received+=value.byteLength;
              progress.value=Math.min(100,received/file.size*100);
              status.textContent=`Preparing this large PDF… ${Math.round(progress.value)}%`;
            }
            parts[index]=new Blob(chunks);
          }
        }));
        blob = new Blob(parts,{type:'application/pdf'});
        if(blob.size!==file.size)throw Error('The PDF was incomplete. Please retry.');
      }
      if(controller.signal.aborted)return;
      status.textContent='Opening in your device’s PDF viewer…';
      // Top-level PDF navigation lets Safari/the browser supply native PDF controls.
      // Do not revoke this URL while the native viewer may still be using it.
      location.replace(URL.createObjectURL(blob));
    } catch(error) {
      controller.abort(); progress.hidden=true; cancel.hidden=true;
      status.textContent=error.name==='AbortError'?'Opening cancelled.':error.message;
      retry.hidden=false;
    } finally { running=false; }
  }
  cancel.onclick=()=>{controller?.abort();status.textContent='Opening cancelled.';progress.hidden=true;cancel.hidden=true;retry.hidden=false;};
  retry.onclick=open;
  open();
})();
