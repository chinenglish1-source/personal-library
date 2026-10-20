(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const record = $('voice-record'), hold = $('voice-hold'), stop = $('voice-stop'), save = $('voice-save'), cancel = $('voice-cancel'), status = $('voice-status');
  let database, recorder, stream, active, chunks = [], state = 'idle', timer, started, cancelled = false, queue = Promise.resolve(), urls = [], generation = 0, storageBroken = false;
  const message = text => { status.textContent = text; };
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
    record.disabled = hold.disabled = next !== 'idle';
    stop.hidden = next !== 'recording'; save.hidden = next !== 'draft';
    cancel.hidden = next === 'idle';
    status.dataset.recording = String(next === 'recording');
  }
  function cleanup() { clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); stream = null; }
  function storageFailure() { message('Could not save to device storage. Keep this page open and retry Save, or download the draft below.'); }
  function formatDuration(ms) { const seconds = Math.floor(ms/1000); return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`; }
  async function render() {
    const notes = await all();
    urls.forEach(url => URL.revokeObjectURL(url)); urls = [];
    const list = $('voice-list'); list.replaceChildren();
    for (const note of notes.sort((a,b) => b.created-a.created)) {
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
      function button(label, action) { const b = document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=async()=>{try{await action();}catch{storageFailure();}}; li.append(b); }
      if(note.draft) button('Keep draft', async()=>{note.draft=false;await put(note);await render();});
      button('Rename', async()=>{const name=prompt('Name this voice note', note.name);if(name?.trim()){note.name=name.trim().slice(0,160);await put(note);await render();}});
      button('Save audio file', async()=>{const blob=await audioBlob(note);const url=URL.createObjectURL(blob);urls.push(url);const a=document.createElement('a');a.href=url;a.download=note.name+(note.mime?.includes('mp4')?'.m4a':'.webm');a.click();});
      button('Delete', async()=>{if(confirm(`Delete “${note.name}”? This cannot be undone.`)){await remove(note.id);await render();}});
      list.append(li);
    }
  }
  async function start() {
    if(state !== 'idle') return;
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){message('Recording is unavailable in this browser. Open the HTTPS library in Safari or Chrome.');return;}
    const token = ++generation;
    controls('requesting'); message('Allow microphone access to start recording.');
    try {
      // Request on this gesture; never request access while merely opening the library.
      const media = await navigator.mediaDevices.getUserMedia({audio:true});
      if(token !== generation || document.hidden) {media.getTracks().forEach(t=>t.stop());if(token===generation)controls('idle');return;}
      stream = media;
      await db();
      if(token !== generation) {media.getTracks().forEach(t=>t.stop());return;}
      const mime = ['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const instance = new MediaRecorder(media, mime ? {mimeType:mime} : undefined);
      const note = {id:crypto.randomUUID(),name:'Voice note',created:Date.now(),mime:instance.mimeType,draft:true};
      await put(note);
      if(token !== generation) {await remove(note.id);media.getTracks().forEach(t=>t.stop());return;}
      recorder=instance; active=note;
      chunks=[]; cancelled=false; storageBroken=false; queue=Promise.resolve(); started=Date.now();
      recorder.ondataavailable = e => {
        if(!e.data.size || cancelled) return;
        const index=chunks.length; chunks.push(e.data);
        queue=queue.then(()=>transaction(['chunks'],'readwrite',tx=>tx.objectStore('chunks').put({id:note.id,index,blob:e.data}))).catch(()=>{storageBroken=true;storageFailure();if(recorder.state==='recording')recorder.stop();});
      };
      recorder.onstop = async()=>{
        note.duration=Date.now()-started; cleanup(); await queue;
        if(cancelled){try{await remove(note.id);}catch{message('Could not remove the cancelled draft; delete it below.');}active=null;controls('idle');await render().catch(storageFailure);return;}
        controls('draft'); if(storageBroken)storageFailure();else message('Recording stopped. Save your note or cancel.');
        const old=$('voice-draft-download');if(old)old.remove();
        const a=document.createElement('a');a.id='voice-draft-download';a.textContent='Download draft';
        const url=URL.createObjectURL(new Blob(chunks,{type:note.mime}));urls.push(url);a.href=url;a.download='voice-note'+(note.mime.includes('mp4')?'.m4a':'.webm');$('voice-notes').insertBefore(a,$('voice-list'));
      };
      recorder.onerror = () => { message('Recording was interrupted. Review the saved draft.'); if(recorder.state !== 'inactive')recorder.stop(); };
      stream.getAudioTracks().forEach(track=>track.addEventListener('ended',()=>{if(recorder.state==='recording')recorder.stop();}));
      recorder.start(1000); controls('recording'); message('● Recording'); $('voice-timer').textContent='00:00';
      timer=setInterval(()=>$('voice-timer').textContent=formatDuration(Date.now()-started),250);
      navigator.storage?.persist?.().catch(()=>{});
    } catch(e) {
      if(token !== generation)return;
      cleanup();controls('idle');
      message(e.name==='NotAllowedError' ? 'Microphone permission denied. Enable it in this site’s browser settings, then tap Record again.' : 'Recording could not start. Check your microphone and device storage, then try again.');
    }
  }
  record.onclick = start;
  stop.onclick = () => { if(recorder?.state==='recording'){stop.disabled=true;recorder.stop();stop.disabled=false;} };
  save.onclick = async()=>{
    if(state!=='draft'||!active)return;save.disabled=true;
    try{await queue;const blob=new Blob(chunks,{type:active.mime});if(!blob.size){message('No audio was captured. Cancel and record again.');return;}
      const note={...active,draft:false,duration:active.duration};
      await transaction(['notes','chunks'],'readwrite',tx=>{tx.objectStore('notes').put(note);tx.objectStore('chunks').delete(IDBKeyRange.bound([note.id,0],[note.id,Number.MAX_SAFE_INTEGER]));tx.objectStore('chunks').put({id:note.id,index:0,blob});});
      active=null;chunks=[];$('voice-draft-download')?.remove();controls('idle');message('Saved privately on this device.');await render();
    }catch{storageFailure();}finally{save.disabled=false;}
  };
  cancel.onclick = async()=>{
    ++generation;
    if(state==='requesting'){cleanup();controls('idle');message('Cancelled.');return;}
    if(state==='recording'){cancelled=true;recorder.stop();return;}
    if(state==='draft'){try{await remove(active.id);active=null;chunks=[];$('voice-draft-download')?.remove();controls('idle');message('Cancelled.');await render();}catch{storageFailure();}}
  };
  let holdTimer, origin;
  const clearHold=()=>{clearTimeout(holdTimer);hold.classList.remove('holding');origin=null;};
  hold.addEventListener('pointerdown',e=>{if(e.isPrimary===false){clearHold();return;}if(e.button!==0||state!=='idle')return;clearHold();origin={x:e.clientX,y:e.clientY};hold.setPointerCapture(e.pointerId);hold.classList.add('holding');holdTimer=setTimeout(()=>{clearHold();start();},1500);});
  hold.addEventListener('pointermove',e=>{if(origin&&Math.hypot(e.clientX-origin.x,e.clientY-origin.y)>15)clearHold();});
  ['pointerup','pointercancel','lostpointercapture'].forEach(event=>hold.addEventListener(event,clearHold));
  hold.addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearHold();if(state==='recording')recorder.stop();else if(state==='requesting'){++generation;cleanup();controls('idle');message('Recording cancelled while the app was hidden.');}}});
  window.addEventListener('pagehide',()=>{if(state==='recording')recorder.stop();});
  render().catch(()=>message('Voice-note storage is unavailable. Check browser privacy settings or available space.'));
})();
