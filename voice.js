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
    if (note.blob) return note.blob instanceof Blob ? note.blob : new Blob([note.blob], {type:note.mime});
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
    button.querySelector('.mic-time').textContent = next === 'recording' ? '00:00' : (next === 'saving' || next === 'requesting') ? '…' : '';
    button.setAttribute('aria-label', next === 'recording' ? 'Recording. Release to save.' : 'Voices. Tap to listen; hold 1 second to record.');
    button.setAttribute('aria-busy', String(next === 'saving'));
  }
  function cleanup() { clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); stream = null; }
  function storageFailure() { message('Could not save. Your draft is kept here; open Voices to retry or download it.'); }
  function formatDuration(ms) { const seconds = Math.floor(ms/1000); return `${Math.floor(seconds/60).toString().padStart(2,'0')}:${(seconds%60).toString().padStart(2,'0')}`; }
  let voiceObserver, renderGeneration=0;
  function clearPlayers() {
    voiceObserver?.disconnect();
    panel.querySelectorAll('audio').forEach(a=>{a.pause();a.removeAttribute('src');a.load();});
    urls.forEach(url=>URL.revokeObjectURL(url));urls=[];
  }
  async function render() {
    const version=++renderGeneration;
    const notes=await all();
    if(version!==renderGeneration)return;
    clearPlayers();
    const list=$('voice-list');list.replaceChildren();
    const pending=new Map();
    voiceObserver=new IntersectionObserver(entries=>{
      for(const e of entries)if(e.isIntersecting){voiceObserver.unobserve(e.target);pending.get(e.target)?.();}
    },{rootMargin:'200px'});
    if(!notes.length){const empty=document.createElement('li');empty.textContent='No voices yet.';list.append(empty);}
    for(const note of notes.sort((a,b)=>a.created-b.created)){
      if(note.id===active?.id&&state!=='idle')continue;
      const li=document.createElement('li');li.className='voice-message';
      const play=document.createElement('button');play.type='button';play.className='voice-play';play.textContent='▶';play.setAttribute('aria-label','Play recording');
      const track=document.createElement('div');track.className='voice-track';
      const wave=document.createElement('div');wave.className='voice-wave';wave.setAttribute('aria-hidden','true');
      for(let i=0;i<36;i++){const bar=document.createElement('i');bar.style.height='3px';wave.append(bar);}
      const seek=document.createElement('input');seek.type='range';seek.min='0';seek.max='1000';seek.value='0';seek.disabled=true;seek.setAttribute('aria-label','Recording position');
      track.append(wave,seek);
      const duration=document.createElement('span');duration.className='voice-duration';duration.textContent=note.duration?formatDuration(note.duration):'00:00';
      const time=document.createElement('time');time.dateTime=new Date(note.created).toISOString();time.textContent=new Date(note.created).toLocaleString([],{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      const del=document.createElement('button');del.type='button';del.className='voice-delete';del.textContent='Delete';del.setAttribute('aria-label','Delete recording from '+time.textContent);
      const audio=document.createElement('audio');audio.preload='metadata';audio.setAttribute('playsinline','');audio.hidden=true;
      li.append(play,track,duration,time,del,audio);list.append(li);
      let preparing;
      const prepare=()=>preparing||(preparing=(async()=>{
        const blob=await audioBlob(note);
        if(version!==renderGeneration||!li.isConnected)return false;
        if(!blob.size)throw Error('Empty recording');
        const url=URL.createObjectURL(blob);urls.push(url);audio.src=url;audio.load();
        // Derive the waveform from the actual sound; no invented amplitudes.
        if(blob.size<20*1024*1024){
          const Context=window.OfflineAudioContext||window.webkitOfflineAudioContext;
          if(Context)blob.arrayBuffer().then(data=>new Context(1,1,44100).decodeAudioData(data)).then(buffer=>{
            if(!li.isConnected)return;
            const samples=buffer.getChannelData(0),peaks=[];
            for(let i=0;i<36;i++){let peak=0;const a=Math.floor(i*samples.length/36),b=Math.floor((i+1)*samples.length/36),step=Math.max(1,Math.floor((b-a)/400));for(let j=a;j<b;j+=step)peak=Math.max(peak,Math.abs(samples[j]));peaks.push(peak);}
            const max=Math.max(.01,...peaks);[...wave.children].forEach((bar,i)=>bar.style.height=(3+23*peaks[i]/max)+'px');
          }).catch(()=>{});
        }
        return true;
      })().catch(()=>{preparing=null;message('Could not load this recording. Tap Play to retry.');return false;}));
      pending.set(li,prepare);voiceObserver.observe(li);
      const sync=()=>{
        const length=Number.isFinite(audio.duration)?audio.duration:note.duration/1000;
        if(length>0){seek.disabled=false;seek.value=String(Math.round(audio.currentTime/length*1000));[...wave.children].forEach((bar,i)=>bar.style.background=i/36<Number(seek.value)/1000?'#214c34':'#76a57c');duration.textContent=formatDuration((audio.currentTime||length)*1000);}
        play.textContent=audio.paused?'▶':'Ⅱ';play.setAttribute('aria-label',audio.paused?'Play recording':'Pause recording');
      };
      ['loadedmetadata','durationchange','timeupdate','play','pause','ended'].forEach(event=>audio.addEventListener(event,sync));
      audio.addEventListener('error',()=>{play.textContent='▶';play.setAttribute('aria-label','Play recording');message('This recording could not be played. Try again in Safari.');});
      play.onclick=async()=>{
        if(!audio.paused){audio.pause();return;}
        panel.querySelectorAll('audio').forEach(a=>{if(a!==audio)a.pause();});
        // Already-loaded audio starts directly in the tap gesture on iPhone.
        if(!audio.src&&!(await prepare()))return;
        try{await audio.play();message('');}catch{message('Tap Play again to allow audio playback.');}
      };
      seek.oninput=()=>{const length=Number.isFinite(audio.duration)?audio.duration:note.duration/1000;if(length>0){audio.currentTime=Number(seek.value)/1000*length;sync();}};
      del.onclick=async()=>{try{del.disabled=true;audio.pause();await remove(note.id);li.remove();if(!list.children.length){const empty=document.createElement('li');empty.textContent='No voices yet.';list.append(empty);}}catch{del.disabled=false;message('Could not delete this recording. Please try again.');}};
    }
  }
  async function finish() {
    if(state === 'requesting') {
      ++generation; cleanup(); controls('idle'); message('Hold again after allowing microphone access.');
    } else if(state === 'recording' && recorder.state !== 'inactive') {
      active.duration=Date.now()-started;clearInterval(timer);controls('saving'); recorder.stop();
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
      // Open storage alongside microphone permission, never after it.
      // Catch immediately so a denied microphone cannot leave an unhandled DB rejection.
      const storageReady = db().then(() => null, error => error);
      media=await navigator.mediaDevices.getUserMedia({audio:true});
      if(token !== generation || !pressing || document.hidden){media.getTracks().forEach(t=>t.stop());return;}
      stream=media;
      const storageError = await storageReady;
      if (storageError) throw storageError;
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
        queue=queue.then(async()=>{const bytes=await e.data.arrayBuffer();return transaction(['chunks'],'readwrite',tx=>tx.objectStore('chunks').put({id:note.id,index,blob:bytes}));}).catch(()=>{storageFailure();finish();});
      };
      recorder.onstop=async()=>{
        controls('saving');note.duration=note.duration??Date.now()-started;cleanup();await queue;
        const blob=new Blob(chunks,{type:note.mime});
        try {
          if(blob.size){
            note.draft=false;
            const bytes=await blob.arrayBuffer();
            await transaction(['notes','chunks'],'readwrite',tx=>{tx.objectStore('notes').put(note);tx.objectStore('chunks').delete(IDBKeyRange.bound([note.id,0],[note.id,Number.MAX_SAFE_INTEGER]));tx.objectStore('chunks').put({id:note.id,index:0,blob:bytes});});
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
      panel.querySelectorAll('audio').forEach(a=>a.pause());
      recorder.start(1000);controls('recording');message('');
      timer=setInterval(()=>button.querySelector('.mic-time').textContent=formatDuration(Date.now()-started),250);
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
    if(state!=='idle'||pressing)return;
    pressing=true;longHold=false;button.classList.add('holding');
    db().catch(()=>{});
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
    button.setAttribute('aria-pressed','true');
    document.querySelectorAll('#voice-dock [data-kind]').forEach(b=>b.setAttribute('aria-pressed','false'));
    panel.hidden=false;document.body.classList.add('voices-open');
    render().catch(storageFailure);
  }
  function hideVoices() {
    if(panel.hidden)return;
    release();panel.querySelectorAll('audio').forEach(a=>a.pause());
    panel.hidden=true;document.body.classList.remove('voices-open');
  }
  function openList(){
    if(document.body.classList.contains('reading')){message('Hold the microphone for 1 second to record. Release to save.');return;}
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
