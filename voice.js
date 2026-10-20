(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const button = $('voices-button'), panel = $('voice-notes'), status = $('voice-status');
  let database, recorder, stream, active, chunks = [], state = 'idle', timer, started, queue = Promise.resolve(), urls = [], generation = 0;
  let pressing = false, holdTimer, origin, longHold = false;
  const message = text => { status.textContent = text; status.hidden = !text; };
  function db() {
    if (!database) database = new Promise((resolve, reject) => {
      const request = indexedDB.open('library.voice.v1', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('notes', {keyPath:'id'});
        request.result.createObjectStore('chunks', {keyPath:['id','index']});
      };
      request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); database = null; }; resolve(request.result); };
      request.onerror = () => { database = null; reject(request.error); };
      request.onblocked = () => message('Close other library tabs to enable voice-note storage.');
    });
    return database;
  }
  async function transaction(stores, mode, action) {
    const connection = await db();
    return new Promise((resolve, reject) => {
      const tx = connection.transaction(stores, mode);
      let result;
      try { result = action(tx); } catch (e) { tx.abort(); reject(e); return; }
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = tx.onabort = () => reject(tx.error || Error('Storage unavailable'));
    });
  }
  const put = note => transaction(['notes'],'readwrite',tx => tx.objectStore('notes').put(note));
  const all = () => transaction(['notes'],'readonly',tx => tx.objectStore('notes').getAll());
  async function audioBlob(note) {
    if (note.blob) return note.blob;
    const records = await transaction(['chunks'],'readonly',tx => tx.objectStore('chunks').getAll(IDBKeyRange.bound([note.id,0],[note.id,Number.MAX_SAFE_INTEGER])));
    return new Blob(records.map(c => c.blob), {type:note.mime});
  }
  async function remove(id) {
    await transaction(['notes','chunks'],'readwrite',tx => {
      tx.objectStore('notes').delete(id);
      tx.objectStore('chunks').delete(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]));
    });
  }
  function controls(next) {
    state = next;
    button.dataset.recording = String(next === 'recording');
    button.textContent = next === 'recording' ? '● Recording 00:00' : next === 'saving' ? 'Saving…' : 'Voices';
    button.setAttribute('aria-busy', String(next === 'saving'));
  }
  function cleanup() { clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); stream = null; }
  function storageFailure() { message('Could not save. Your draft is kept here; open Voices to retry or download it.'); }
  function formatDuration(ms) { const seconds = Math.floor(ms/1000); return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`; }
  async function render() {
    const notes = await all();
    urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
    const list = $('voice-list'); list.replaceChildren();
    if (!notes.length) { const empty=document.createElement('li'); empty.textContent='No voices yet.'; list.append(empty); }
    for (const note of notes.sort((a,b) => a.created-b.created)) {
      if (note.id === active?.id && state !== 'idle') continue;
      const li = document.createElement('li'), title = document.createElement('h3'), time = document.createElement('time');
      title.textContent = note.name + (note.draft ? ' — recovered draft' : '');
      time.dateTime = new Date(note.created).toISOString(); time.textContent = new Date(note.created).toLocaleString(); li.append(title,time);
      // Audio data stays in IndexedDB until the user requests playback.
      const play = document.createElement('button'); play.textContent = 'Play'; play.type = 'button';
      play.onclick = async () => {
        try {
          const blob = await audioBlob(note);
          if (!blob.size) { message('This interrupted draft contains no audio.'); return; }
          const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata';
          const url = URL.createObjectURL(blob); urls.push(url); audio.src = url; play.replaceWith(audio);
          audio.play().catch(() => message('Tap the audio Play control to listen.'));
        } catch { message('Could not load this recording. Please try again.'); }
      };
      li.append(play);
      const options=document.createElement('details'), summary=document.createElement('summary');summary.textContent='Options';options.append(summary);li.append(options);
      function button(label, action) { const b = document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=async()=>{try{await action();}catch{storageFailure();}}; options.append(b); }
      if(note.draft) button('Keep draft', async()=>{note.draft=false;await put(note);await render();});
      button('Rename', async()=>{const name=prompt('Name this voice note', note.name);if(name?.trim()){note.name=name.trim().slice(0,160);await put(note);await render();}});
      button('Save audio file', async()=>{const blob=await audioBlob(note);const url=URL.createObjectURL(blob);urls.push(url);const a=document.createElement('a');a.href=url;a.download=note.name+(note.mime?.includes('mp4')?'.m4a':'.webm');a.click();});
      button('Delete', async()=>{if(confirm(`Delete “${note.name}”? This cannot be undone.`)){await remove(note.id);await render();}});
      list.append(li);
    }
    list.scrollTop=list.scrollHeight;
  }
  async function finish() {
    if(state === 'requesting') {
      ++generation; cleanup(); controls('idle'); message('Hold again after allowing microphone access.');
    } else if(state === 'recording' && recorder.state !== 'inactive') {
      controls('saving'); recorder.stop();
    }
  }
  async function start() {
    if(state !== 'idle' || !pressing) return;
    if(active && chunks.length){message('Tap Voices to retry saving the previous recording.');return;}
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){message('Recording is unavailable in this browser. Open the library in Safari or Chrome.');return;}
    const token=++generation;
    controls('requesting');message('Allow microphone access, then keep holding to record.');
    let media;
    try {
      media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(token !== generation || !pressing || document.hidden){media.getTracks().forEach(t=>t.stop());return;}
      stream=media;
      await db();
      if(token !== generation || !pressing){media.getTracks().forEach(t=>t.stop());return;}
      const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const instance=new MediaRecorder(media,mime?{mimeType:mime}:undefined);
      const note={id:crypto.randomUUID(),name:'Voice',created:Date.now(),mime:instance.mimeType,draft:true};
      await put(note);
      if(token !== generation || !pressing){await remove(note.id);media.getTracks().forEach(t=>t.stop());return;}
      recorder=instance;active=note;chunks=[];queue=Promise.resolve();started=Date.now();
      recorder.ondataavailable=e=>{
        if(!e.data.size)return;
        const index=chunks.length;chunks.push(e.data);
        queue=queue.then(()=>transaction(['chunks'],'readwrite',tx=>tx.objectStore('chunks').put({id:note.id,index,blob:e.data}))).catch(()=>{storageFailure();finish();});
      };
      recorder.onstop=async()=>{
        controls('saving');note.duration=Date.now()-started;cleanup();await queue;
        const blob=new Blob(chunks,{type:note.mime});
        try {
          if(blob.size){
            note.draft=false;
            await transaction(['notes','chunks'],'readwrite',tx=>{tx.objectStore('notes').put(note);tx.objectStore('chunks').delete(IDBKeyRange.bound([note.id,0],[note.id,Number.MAX_SAFE_INTEGER]));tx.objectStore('chunks').put({id:note.id,index:0,blob});});
            message('Saved');setTimeout(()=>{if(state==='idle'&&status.textContent==='Saved')message('');},1800);
          } else {await remove(note.id);message('No audio captured. Hold again to record.');}
          active=null;chunks=[];
        } catch {
          // Keep a download available even if device storage cannot accept the final audio.
          storageFailure();
          const a=document.createElement('a');a.textContent='Download unsaved voice';
          const url=URL.createObjectURL(blob);a.href=url;a.download='voice'+(note.mime.includes('mp4')?'.m4a':'.webm');
          a.onclick=()=>setTimeout(()=>URL.revokeObjectURL(url),60000);status.append(' ',a);
        }
        controls('idle');
        if(!panel.hidden)render().catch(storageFailure);
      };
      recorder.onerror=()=>{message('Recording interrupted. Saving the audio received.');finish();};
      media.getAudioTracks().forEach(track=>track.addEventListener('ended',finish));
      recorder.start(1000);controls('recording');message('');
      timer=setInterval(()=>button.textContent='● Recording '+formatDuration(Date.now()-started),250);
      navigator.storage?.persist?.().catch(()=>{});
    }catch(e){
      media?.getTracks().forEach(t=>t.stop());
      if(token!==generation)return;
      cleanup();controls('idle');message(e.name==='NotAllowedError'?'Microphone denied. Allow access in browser settings, then hold Voices again.':'Could not start recording. Check your microphone and storage.');
    }
  }
  function release() {
    clearTimeout(holdTimer);pressing=false;origin=null;button.classList.remove('holding');finish();
  }
  function begin() {
    if(state!=='idle')return;
    pressing=true;longHold=false;button.classList.add('holding');
    holdTimer=setTimeout(()=>{longHold=true;button.classList.remove('holding');start();},1000);
  }
  button.addEventListener('pointerdown',e=>{
    if(!e.isPrimary){release();longHold=true;return;}
    if(e.button!==0||state!=='idle')return;
    origin={x:e.clientX,y:e.clientY};button.setPointerCapture(e.pointerId);begin();
  });
  button.addEventListener('pointermove',e=>{if(origin&&state==='idle'&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>18){release();longHold=true;}});
  button.addEventListener('pointerup',release);
  ['pointercancel','lostpointercapture'].forEach(event=>button.addEventListener(event,()=>{if(pressing){release();longHold=true;}}));
  button.addEventListener('contextmenu',e=>e.preventDefault());
  button.addEventListener('keydown',e=>{if(e.key===' '&&!e.repeat){e.preventDefault();begin();}});
  button.addEventListener('keyup',e=>{if(e.key===' '){e.preventDefault();const held=longHold;release();if(!held)openList();}});
  function showVoices() {
    panel.hidden=false;document.body.classList.add('voices-open');$('main').inert=true;
    $('voice-heading').focus({preventScroll:true});render().catch(storageFailure);
  }
  function hideVoices() {
    if(panel.hidden)return;
    release();panel.querySelectorAll('audio').forEach(a=>a.pause());
    panel.hidden=true;document.body.classList.remove('voices-open');$('main').inert=false;button.focus({preventScroll:true});
  }
  function openList(){
    if(state!=='idle')return;
    if(active&&chunks.length){recorder.onstop();return;}
    if(!panel.hidden)return;
    history.pushState({libraryVoices:true,returnUrl:location.pathname+location.search+location.hash},'',location.pathname+location.search+'#voices');
    showVoices();
  }
  function back() {
    if(panel.hidden)return;
    release();
    if(history.state?.libraryVoices && history.state.returnUrl)history.back();
    else {history.replaceState(null,'',location.pathname+location.search+'#ar-study');hideVoices();window.dispatchEvent(new HashChangeEvent('hashchange'));}
  }
  function syncRoute(){swipe=null;if(location.hash==='#voices')showVoices();else hideVoices();}
  button.onclick=()=>{if(longHold){longHold=false;return;}openList();};
  $('voices-back').onclick=back;
  window.addEventListener('librarysectionchange',hideVoices);
  window.addEventListener('popstate',syncRoute);
  window.addEventListener('hashchange',syncRoute);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden){e.preventDefault();back();}});
  let swipe;
  panel.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    // Leave the screen edge to Safari's native history gesture.
    swipe=e.touches.length===1&&t.clientX>48&&(window.visualViewport?.scale||1)<=1.05&&!String(getSelection())&&!e.target.closest('audio,button,a,summary,input')?{x:t.clientX,y:t.clientY,time:Date.now()}:null;
  },{passive:true});
  panel.addEventListener('touchmove',e=>{if(e.touches.length!==1||(swipe&&Math.abs(e.touches[0].clientY-swipe.y)>35))swipe=null;},{passive:true});
  panel.addEventListener('touchcancel',()=>{swipe=null;},{passive:true});
  panel.addEventListener('touchend',e=>{
    const start=swipe;swipe=null;if(!start||e.touches.length||String(getSelection())||(window.visualViewport?.scale||1)>1.05||Date.now()-start.time>900)return;
    const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;
    if(dx>90&&dx>Math.abs(dy)*3)back();
  },{passive:true});
  syncRoute();
  window.addEventListener('blur',()=>{if(pressing)release();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  window.addEventListener('pagehide',release);
})();
