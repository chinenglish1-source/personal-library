(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), empty = $("empty"), status = $("status");
  const tabBtns = [...document.querySelectorAll("button[data-kind]")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const TEXT = { study: "Studying", book: "Books", doc: "Docs", empty: "Nothing here yet." };

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v; else n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
  }

  const studyKey = "library.study.v1", positionKey = "library.positions.v1";
  function readStore(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  let selected = readStore(studyKey, []);
  if (!Array.isArray(selected)) selected = [];
  selected = [...new Set(selected)].filter(href => LIBRARY.some(it => it.link === href));
  let positions = readStore(positionKey, {});
  if (typeof positions !== "object" || Array.isArray(positions)) positions = {};
  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { $("app-message").hidden = false; $("app-message").textContent = "Device storage is unavailable or full. New selections and progress cannot be saved."; return false; }
  }
  let undoItem=null, undoTimer, suppressStudyClickUntil=0;
  function removeStudy(href) {
    const index=selected.indexOf(href);if(index<0)return;
    const next=selected.filter(h=>h!==href);
    if(!store(studyKey,next))return;
    selected=next;undoItem={href,index};applyView();
    $("study-undo").hidden=false;clearTimeout(undoTimer);
    undoTimer=setTimeout(()=>{$("study-undo").hidden=true;undoItem=null;},8000);
  }
  $("study-undo-button").onclick=()=>{
    if(!undoItem)return;
    const next=selected.filter(h=>h!==undoItem.href);next.splice(Math.min(undoItem.index,next.length),0,undoItem.href);
    if(store(studyKey,next)){selected=next;applyView();$("study-undo").hidden=true;clearTimeout(undoTimer);undoItem=null;}
  };
  function studySwipe(li,href) {
    let drag=null;
    const reset=()=>{li.style.transform='';li.classList.remove('swiping');drag=null;};
    li.addEventListener('pointerdown',e=>{
      if(kind!=='study'||e.button!==0||!e.isPrimary||e.target.closest('button')||(window.visualViewport?.scale||1)>1.05||String(getSelection())){reset();return;}
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,horizontal:false};
    });
    li.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(!drag.horizontal&&Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){reset();return;}
      if((window.visualViewport?.scale||1)>1.05||String(getSelection())){reset();return;}
      if(dx < -12 && Math.abs(dx)>Math.abs(dy)*2){drag.horizontal=true;li.classList.add('swiping');li.setPointerCapture(e.pointerId);}
      if(drag.horizontal){drag.dx=Math.min(0,dx);li.style.transform=`translate3d(${drag.dx}px,0,0)`;suppressStudyClickUntil=Date.now()+500;}
    });
    li.addEventListener('pointerup',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const remove=drag.horizontal&&-drag.dx>Math.max(95,li.clientWidth*.32);
      const dx=drag.dx;reset();
      if(remove){
        suppressStudyClickUntil=Date.now()+600;
        li.animate([{transform:`translateX(${dx}px)`,opacity:1},{transform:'translateX(-110%)',opacity:0}],{duration:reduceMotion.matches?0:170,easing:'ease-out'}).finished.then(()=>removeStudy(href));
      }
    });
    li.addEventListener('pointercancel',reset);
    li.addEventListener('lostpointercapture',e=>{if(e.target===li)reset();});
    li.addEventListener('touchstart',e=>{if(e.touches.length>1)reset();},{passive:true});
  }
  function card(it) {
    const preview = it.link
      ? el("div", { class: "preview", "data-src": it.link, "aria-hidden": "true" },
          el("span", { class: "preview-loading" }, "Loading preview…"))
      : null;
    const body = [
      preview,
      el("h2", { class: "title", dir: "auto" }, it.title),
      it.author ? el("p", { class: "by", dir: "auto" }, it.author) : null,
    ];
    const c = it.link
      ? el("a", { class: "card", href: it.link, "data-title": it.title }, ...body)
      : el("article", { class: "card" }, ...body);
    const li = el("li", { class: "item", "data-kind": it.kind, "data-lang": it.lang }, c);
    if (it.link) {
      const button = el("button", {type:"button", class:"study-toggle", "data-href":it.link}, "+ Study");
      button.addEventListener("click", () => {
        if(kind === "study" && selected.includes(it.link)){removeStudy(it.link);return;}
        const next = selected.includes(it.link) ? selected.filter(h => h !== it.link) : [...selected, it.link];
        if (store(studyKey, next)) { selected = next; applyView(); }
      });
      li.append(button);
      li.append(el("span",{class:"study-progress","aria-hidden":"true"}));
      studySwipe(li,it.link);
    }
    return li;
  }

  const items = LIBRARY
    .slice()
    .map((it) => it.kind === "book" && it.type !== "PDF" ? { ...it, kind: "doc" } : it)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map(card);
  const itemByHref=new Map(items.map(li=>[li.querySelector(".study-toggle")?.dataset.href,li]));
  grid.append(...items);

  let lang = "ar", kind = "study";

  function fromHash() {
    const m = /^#(ar|en)-(book|note|doc|study)$/.exec(location.hash);
    if (m) {
      lang = m[1];
      kind = m[2] === "note" ? "doc" : m[2];
      if (m[2] === "note") {
        try { history.replaceState(null, "", location.pathname + location.search + `#${lang}-doc`); } catch {}
      }
    }
  }

  function applyView() {
    grid.dataset.kind = kind;
    document.body.classList.toggle("study-view",kind==="study");
    const t = TEXT;
    tabBtns.forEach((b) => {
      b.textContent = t[b.dataset.kind];
      b.setAttribute("aria-pressed", String(b.dataset.kind === kind && location.hash !== "#voices"));
    });
    $("voices-button").setAttribute("aria-pressed", String(location.hash === "#voices"));

    const savedPositions=readStore(positionKey, {});
    for (const li of items) {
      const button = li.querySelector(".study-toggle");
      const active = button && selected.includes(button.dataset.href);
      if (button) { button.textContent = active ? "✓ Study" : "+ Study"; button.setAttribute("aria-label", active ? "Remove from Studying now" : "Add to Studying now"); button.setAttribute("aria-pressed", String(active)); }
      if(button && kind === "study")button.textContent="Remove";
      const progress=li.querySelector(".study-progress");
      if(progress){const saved=savedPositions[button.dataset.href];progress.textContent=saved?.page ? `Continue · page ${saved.page}` : "Open";}
      li.hidden = kind === "study" ? !active : li.dataset.kind !== kind;
      li.style.order = kind === "study" ? selected.indexOf(button?.dataset.href) : "";
    }
    grid.append(...(kind === "study" ? [...items].sort((a,b) => Number(a.style.order)-Number(b.style.order)) : items));
    updateStatus();
  }

  function updateStatus() {
    const t = TEXT;
    const inView = items.filter((li) => !li.hidden);
    grid.hidden = !inView.length;
    if (!inView.length) { empty.hidden = kind === "study"; empty.textContent = status.textContent = kind === "study" ? "Choose Books or Docs, then add two or three items to Studying now." : t.empty; return; }
    empty.hidden = true;
    status.textContent = String(inView.length);
  }

  let fadeTimer;
  function setView(nextLang, nextKind) {
    if (nextLang === lang && nextKind === kind && location.hash !== "#voices") return;
    lang = nextLang; kind = nextKind;
    try { history.replaceState(null, "", location.pathname + location.search + `#${lang}-${kind}`); } catch {}
    applyView();
    window.dispatchEvent(new Event("librarysectionchange"));
  }

  tabBtns.forEach((b) => b.addEventListener("click", () => setView(lang, b.dataset.kind)));

  /* Arrow keys move between buttons in a group. */
  function arrowNav(btns, pick) {
    btns.forEach((b, i) => b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const forward = e.key === "ArrowRight";
      const j = (i + (forward ? 1 : -1) + btns.length) % btns.length;
      btns[j].focus();
      pick(btns[j]);
    }));
  }
  arrowNav([...$("voice-dock").querySelectorAll("button")], (b) => b.click());

  window.addEventListener("hashchange", () => { fromHash(); applyView(); });

  /* Reader — files open inside the page, rendered with PDF.js. */
  const reader = $("reader"), pages = $("pages"), rTitle = $("reader-title"), rCount = $("reader-count");
  let openDoc = null, observer = null, lastCard = null, thumbObserver = null;
  let readerSession = null;
  // Only books already opened by the user are retained. No speculative PDF fetches.
  const recentReaders = new Map();
  function destroySession(session) {
    session.controller.abort();
    if (session.task) {
      // PDF.js 3 can reject an internal WebKit fetch if destroyed before its
      // transport exists. Finish the small document handshake, then dispose it.
      if (session.document || session.range?.started) Promise.resolve(session.task.destroy()).catch(() => {});
      else session.task.promise.then(() => session.task.destroy()).catch(() => {});
    }
  }
  let pdfPromise, sharedReaderWorker;
  function readerWorker() {
    if (!sharedReaderWorker) {
      const worker = sharedReaderWorker = new pdfjsLib.PDFWorker({name:"library-reader"});
      worker.promise.catch(() => {
        if (sharedReaderWorker === worker) sharedReaderWorker = null;
        worker.destroy();
      });
    }
    return sharedReaderWorker;
  }
  function loadPDF() {
    if (!pdfPromise) pdfPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script"); script.src = "vendor/pdf.min.js";
      script.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; resolve(); };
      script.onerror = () => { script.remove(); pdfPromise = null; reject(Error("Viewer unavailable")); };
      document.head.append(script);
    });
    return pdfPromise;
  }
  // Warm only the viewer code after the useful interface is visible; never preload books.
  if ("requestIdleCallback" in window) requestIdleCallback(() => loadPDF().catch(() => {}), {timeout:2500});
  else setTimeout(() => loadPDF().catch(() => {}), 1000);

  const hosted = true;
  const hostedFiles = {"files/02.pdf":{"cover":"covers/02.jpg","size":377887,"opening":"openings/02-b10960d03b27.bin"},"files/03.pdf":{"cover":"covers/03.jpg","size":469897,"opening":"openings/03-3564aa92d3fb.bin"},"files/04.pdf":{"cover":"covers/04.jpg","size":1316359,"opening":"openings/04-ca8f8225d785.bin"},"files/05.pdf":{"cover":"covers/05.jpg","size":1431062,"opening":"openings/05-8494fa44cab6.bin"},"files/06.pdf":{"cover":"covers/06.jpg","size":407806,"opening":"openings/06-7df911992f0f.bin"},"files/07.pdf":{"cover":"covers/07.jpg","size":354053,"opening":"openings/07-d7153f92dc83.bin"},"files/12.pdf":{"cover":"covers/12.jpg","size":810374,"opening":"openings/12-6e91a57a3101.bin"},"files/13.pdf":{"cover":"covers/13.jpg","size":782603,"opening":"openings/13-b5dba6b67e66.bin"},"files/14.pdf":{"cover":"covers/14.jpg","size":577431,"opening":"openings/14-d6cad8acace2.bin"},"files/15.pdf":{"cover":"covers/15.jpg","size":942922,"opening":"openings/15-f3a68c036940.bin"},"files/16.pdf":{"cover":"covers/16.jpg","size":1126868,"opening":"openings/16-f0a45f20917a.bin"},"files/17.pdf":{"cover":"covers/17.jpg","size":653158,"opening":"openings/17-ccb14b4936f4.bin"},"files/18.pdf":{"cover":"covers/18.jpg","size":56248,"opening":"openings/18-630d59d84444.bin"},"files/19.pdf":{"cover":"covers/19.jpg","size":1833583,"opening":"openings/19-03a31f3725b2.bin"},"files/20.pdf":{"cover":"covers/20.jpg","size":1062448,"opening":"openings/20-f653ae82dce0.bin"},"files/21.pdf":{"cover":"covers/21.jpg","size":10846008,"opening":"openings/21-b4c3f7f96251.bin"},"files/22.pdf":{"cover":"covers/22.jpg","size":5477257,"opening":"openings/22-6953ca03932e.bin"},"files/23.pdf":{"cover":"covers/23.jpg","parts":["files/23.part00","files/23.part01","files/23.part02"],"size":34244995,"opening":"openings/23-eb50f18c467d.bin"},"files/24.pdf":{"cover":"covers/24.jpg","size":4871012,"opening":"openings/24-e52f779e1d14.bin"},"files/25.pdf":{"cover":"covers/25.jpg","size":2089213,"opening":"openings/25-c42a5fdd7115.bin"},"files/26.pdf":{"cover":"covers/26.jpg","size":6178103,"opening":"openings/26-0f9e7be5a21f.bin"},"files/27.pdf":{"cover":"covers/27.jpg","size":13332456,"opening":"openings/27-e8008e013e6a.bin"},"files/28.pdf":{"cover":"covers/28.jpg","size":1279033,"opening":"openings/28-f8417dbf1111.bin"},"files/29.pdf":{"cover":"covers/29.jpg","size":9442722,"opening":"openings/29-ece4665bd596.bin"},"files/30.pdf":{"cover":"covers/30.jpg","size":5380894,"opening":"openings/30-e0796041758a.bin"},"files/31.pdf":{"cover":"covers/31.jpg","size":2314149,"opening":"openings/31-6ceb8b3364f6.bin"},"files/32.pdf":{"cover":"covers/32.jpg","parts":["files/32.part00","files/32.part01"],"size":26922223,"opening":"openings/32-09c32db5fa35.bin"},"files/33.pdf":{"cover":"covers/33.jpg","size":5874317,"opening":"openings/33-34f0c22d10c8.bin"},"files/34.pdf":{"cover":"covers/34.jpg","size":14104839,"opening":"openings/34-39c405917a6e.bin"},"files/35.pdf":{"cover":"covers/35.jpg","size":7364334,"opening":"openings/35-ce21da583795.bin"},"files/36.pdf":{"cover":"covers/36.jpg","size":7411365,"opening":"openings/36-bda966d33000.bin"},"files/37.pdf":{"cover":"covers/37.jpg","size":9922818,"opening":"openings/37-9bc8ec1ec0a9.bin"},"files/38.pdf":{"cover":"covers/38.jpg","size":3648478,"opening":"openings/38-d3c5ac29dadb.bin"},"files/39.pdf":{"cover":"covers/39.jpg","size":8625430,"opening":"openings/39-71b58debc2da.bin"},"files/40.pdf":{"cover":"covers/40.jpg","size":984570,"opening":"openings/40-e65df08d8655.bin"},"files/41.pdf":{"cover":"covers/41.jpg","parts":["files/41.part00","files/41.part01"],"size":24559661,"opening":"openings/41-8e5695564d06.bin"},"files/42.pdf":{"cover":"covers/42.jpg","parts":["files/42.part00","files/42.part01"],"size":25666603,"opening":"openings/42-98f16507dd9a.bin"},"files/43.pdf":{"cover":"covers/43.jpg","parts":["files/43.part00","files/43.part01","files/43.part02","files/43.part03"],"size":58653288,"opening":"openings/43-426b9094f13b.bin"},"files/44.pdf":{"cover":"covers/44.jpg","parts":["files/44.part00","files/44.part01"],"size":32435559,"opening":"openings/44-c0fea66ea65f.bin"},"files/45.pdf":{"cover":"covers/45.jpg","size":189678,"opening":"openings/45-5602aec2ca1a.bin"},"files/46.pdf":{"cover":"covers/46.jpg","size":187971,"opening":"openings/46-82937143db90.bin"},"files/47.pdf":{"cover":"covers/47.jpg","size":6541280,"opening":"openings/47-8b04069331ea.bin"},"files/48.pdf":{"cover":"covers/48.jpg","size":14542766,"opening":"openings/48-28cb66f6a451.bin"},"files/49.pdf":{"cover":"covers/49.jpg","size":12540813,"opening":"openings/49-05b12be25c93.bin"},"files/50.pdf":{"cover":"covers/50.jpg","size":12631626,"opening":"openings/50-e414d3716019.bin"},"files/51.pdf":{"cover":"covers/51.jpg","size":8022443,"opening":"openings/51-9fe71ae9367d.bin"},"files/52.pdf":{"cover":"covers/52.jpg","size":18106982,"opening":"openings/52-601a6e25a927.bin"},"files/53.pdf":{"cover":"covers/53.jpg","parts":["files/53.part00","files/53.part01"],"size":21887641,"opening":"openings/53-09f506987afd.bin"},"files/54.pdf":{"cover":"covers/54.jpg","size":567766,"opening":"openings/54-c45d88f9e693.bin"},"files/55.pdf":{"cover":"covers/55.jpg","parts":["files/55.part00","files/55.part01"],"size":25476788,"opening":"openings/55-c5bc63ae236d.bin"},"files/56.pdf":{"cover":"covers/56.jpg","size":19429763,"opening":"openings/56-5d59b732e173.bin"},"files/57.pdf":{"cover":"covers/57.jpg","size":7193322,"opening":"openings/57-b3e49bced315.bin"},"files/58.pdf":{"cover":"covers/58.jpg","parts":["files/58.part00","files/58.part01","files/58.part02"],"size":47579454,"opening":"openings/58-cbb58909879d.bin"},"files/59.pdf":{"cover":"covers/59.jpg","size":10952490,"opening":"openings/59-7212d28c43e2.bin"},"files/60.pdf":{"cover":"covers/60.jpg","size":541605,"opening":"openings/60-2e66bd95c665.bin"},"files/61.pdf":{"cover":"covers/61.jpg","size":321910,"opening":"openings/61-a7f66ab5d4fc.bin"},"files/62.pdf":{"cover":"covers/62.jpg","size":156105,"opening":"openings/62-2d0d45533578.bin"},"files/63.pdf":{"cover":"covers/63.jpg","size":289563,"opening":"openings/63-20d7d99d1a73.bin"},"files/64.pdf":{"cover":"covers/64.jpg","size":7732372,"opening":"openings/64-4e05a0dfbf3c.bin"},"files/65.pdf":{"cover":"covers/65.jpg","parts":["files/65.part00","files/65.part01"],"size":28715989,"opening":"openings/65-098d20328bdb.bin"},"files/66.pdf":{"cover":"covers/66.jpg","parts":["files/66.part00","files/66.part01"],"size":22573201,"opening":"openings/66-f678309a11e2.bin"},"files/67.pdf":{"cover":"covers/67.jpg","size":1606607,"opening":"openings/67-1d31be878ccf.bin"},"files/68.pdf":{"cover":"covers/68.jpg","size":613824,"opening":"openings/68-3a8a404993e9.bin"}};
  async function loadOpening(href, signal) {
    const file = hostedFiles[href];
    if (!file?.opening || signal?.aborted) return null;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, {once:true});
    const timer = setTimeout(abort, 15000);
    try {
      const response = await fetch(file.opening, {signal:controller.signal, priority:"high"});
      if (!response.ok) return null;
      clearTimeout(timer);
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length < 4 || data.length > 12*1024*1024+65536) return null;
      const length = new DataView(data.buffer).getUint32(0, true);
      if (length > 65536 || length+4 > data.length) return null;
      const header = JSON.parse(new TextDecoder().decode(data.subarray(4,4+length)));
      if (header.v !== 1 || header.size !== file.size || !Array.isArray(header.blocks)) return null;
      let offset = 4+length, last = 0;
      const blocks = [];
      for (const pair of header.blocks) {
        const [start,end] = pair;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start<last || end<=start || end>file.size || offset+end-start>data.length) return null;
        blocks.push({start,end,data:data.subarray(offset,offset+end-start)});
        offset += end-start; last=end;
      }
      if (offset !== data.length) return null;
      return (begin,end) => {
        let cursor=begin;
        const pieces=[];
        for (const block of blocks) {
          if (block.end<=cursor) continue;
          if (block.start>cursor) return null;
          const stop=Math.min(end,block.end);
          pieces.push(block.data.subarray(cursor-block.start,stop-block.start));
          cursor=stop;
          if (cursor===end) {
            if(pieces.length===1)return pieces[0];
            const joined=new Uint8Array(end-begin);let at=0;
            for(const piece of pieces){joined.set(piece,at);at+=piece.length;}
            return joined;
          }
        }
        return null;
      };
    } catch { return null; }
    finally {clearTimeout(timer);signal?.removeEventListener("abort",abort);}
  }
  async function pdfOptions(url, signal, progress, onError, openingPromise) {
    const options = {
      isEvalSupported: false,
      disableAutoFetch: true,
      disableStream: true,
      rangeChunkSize: 65536,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
    };
    const file = hosted && hostedFiles[url];
    if (!file || !file.size) return { ...options, url };
    // Known sizes avoid an initial whole-file probe. Map ranges across 16 MiB
    // parts, or directly into a single PDF; never preload unopened books.
    const partSize = file.parts ? 16 * 1024 * 1024 : file.size;
    const controller = new AbortController();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", () => controller.abort(), { once: true });
    const range = new pdfjsLib.PDFDataRangeTransport(file.size, new Uint8Array(0));
    const wholeParts = new Map();
    const opening = await (openingPromise || loadOpening(url, signal));
    options.rangeChunkSize = opening ? 4096 : 65536;
    // Precise opening slices reduce download size. Later pages still fetch
    // deduplicated 64 KiB network blocks, bounded to 4 MiB per retained reader.
    const blocks = new Map(), pendingBlocks = new Map();
    async function readRange(begin,end) {
      const bytes = new Uint8Array(end-begin);
      await Promise.all(Array.from({length:Math.floor((end-1)/partSize)-Math.floor(begin/partSize)+1},(_,i)=>i+Math.floor(begin/partSize)).map(async index=>{
        const partStart=index*partSize, start=Math.max(begin-partStart,0), stop=Math.min(end-partStart,partSize,file.size-partStart);
        let data=wholeParts.get(index);
        if(data)data=data.subarray(start,stop);
        else {
          const response=await fetch((file.parts||[url])[index],{signal:controller.signal,priority:"high",headers:{Range:`bytes=${start}-${stop-1}`}});
          if(!response.ok)throw Error("File unavailable");
          data=new Uint8Array(await response.arrayBuffer());
          if(response.status===200){
            if(data.length!==Math.min(partSize,file.size-partStart))throw Error("Incomplete file part");
            wholeParts.set(index,data);data=data.subarray(start,stop);
          }else if(response.status!==206||response.headers.get("Content-Range")!==`bytes ${start}-${stop-1}/${Math.min(partSize,file.size-partStart)}`)throw Error("Invalid file range");
        }
        if(data.length!==stop-start)throw Error("Incomplete file range");
        bytes.set(data,partStart+start-begin);
      }));
      return bytes;
    }
    async function readBlock(begin) {
      if(blocks.has(begin)){const data=blocks.get(begin);blocks.delete(begin);blocks.set(begin,data);return data;}
      if(pendingBlocks.has(begin))return pendingBlocks.get(begin);
      const task=readRange(begin,Math.min(file.size,begin+65536)).then(data=>{blocks.set(begin,data);while(blocks.size>64)blocks.delete(blocks.keys().next().value);return data;}).finally(()=>pendingBlocks.delete(begin));
      pendingBlocks.set(begin,task);return task;
    }
    let loaded = 0;
    range.abort = () => controller.abort();
    range.requestDataRange = (begin, end) => {
      range.started = true;
      (async () => {
        const warmed = opening?.(begin,end);
        if (warmed) { await Promise.resolve(); if(!controller.signal.aborted)range.onDataRange(begin,warmed); return; }
        let bytes;
        if (!opening) bytes=await readRange(begin,end);
        else {
          bytes=new Uint8Array(end-begin);
          const requests=[];
          for(let block=Math.floor(begin/65536)*65536;block<end;block+=65536){
            requests.push((async()=>{const data=await readBlock(block),start=Math.max(begin,block),stop=Math.min(end,block+data.length);bytes.set(data.subarray(start-block,stop-block),start-begin);})());
          }
          await Promise.all(requests);
        }
        if (controller.signal.aborted) return;
        loaded = Math.min(file.size, loaded + bytes.length);
        if (progress) progress({ loaded, total: file.size });
        range.onDataRange(begin, bytes);
      })().catch(error => { if (onError) onError(error); });
    };
    return { ...options, range, length: file.size };
  }

  async function renderThumbnail(box) {
    if (box.dataset.state) return;
    box.dataset.state = "loading";
    let doc = null;
    try {
      if (hosted && hostedFiles[box.dataset.src]) {
        const cover = new Image();
        cover.alt = "";
        cover.fetchPriority = "low";
        cover.src = hostedFiles[box.dataset.src].cover;
        await cover.decode();
        const scale = Math.min(box.clientWidth / cover.naturalWidth, box.clientHeight / cover.naturalHeight);
        cover.style.width = `${Math.floor(cover.naturalWidth * scale)}px`;
        cover.style.height = `${Math.floor(cover.naturalHeight * scale)}px`;
        box.replaceChildren(el("span", { class: "book-volume" }, cover));
        box.dataset.state = "ready";
        return;
      }
      doc = await pdfjsLib.getDocument(await pdfOptions(box.dataset.src)).promise;
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const cssScale = Math.min((box.clientWidth || 260) / base.width, (box.clientHeight || 150) / base.height);
      const scale = cssScale * Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      canvas.style.width = `${Math.max(1, Math.floor(base.width * cssScale))}px`;
      canvas.style.height = `${Math.max(1, Math.floor(base.height * cssScale))}px`;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      box.replaceChildren(el("span", { class: "book-volume" }, canvas));
      box.dataset.state = "ready";
    } catch {
      box.classList.add("is-error");
      box.replaceChildren(el("span", {}, "Preview unavailable"));
      box.dataset.state = "error";
    } finally {
      if (doc) doc.destroy();
    }
  }

  {
    thumbObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        thumbObserver.unobserve(entry.target);
        renderThumbnail(entry.target);
      }
    }, { rootMargin: "600px 0px" });
    document.querySelectorAll(".preview").forEach((box) => thumbObserver.observe(box));
  }

  async function openReader(href, title, card, addHistory = true) {
    releaseReader();
    const cached = recentReaders.get(href);
    recentReaders.delete(href);
    const session = { ...(cached || {controller:new AbortController(), task:null}), href,
      study:kind === "study", ready:false, renders:new Set(), pending:new Set(), rendering:false };

    readerSession = session;
    lastCard = card;
    if (addHistory) history.pushState({ libraryReader: true, href, title }, "");
    updateStudyNavigation();
    const current = () => readerSession === session;
    const progress = ({ loaded, total }) => {
      if (!current()) return;
      if (total) session.bytes = total;
      const message = pages.querySelector(".reader-msg");
      if (message) message.textContent = total ? `Opening… ${Math.min(100, Math.round(loaded / total * 100))}%` : "Opening…";
    };
    $("reader-download").disabled = true;
    $("reader-download").textContent = "Download";
    rTitle.textContent = title;
    rCount.textContent = "";
    pages.replaceChildren(el("p", { class: "reader-msg", role: "status" }, "Opening…"));
    reader.hidden = false;
    $("main").inert = true;
    document.body.classList.add("reading");
    $("reader-close").focus();
    try {
      const openingPromise = session.document ? null : loadOpening(href, session.controller.signal);
      await loadPDF();
      if (!current()) return;
      if (!session.document) {
      // Warm one shared worker alongside the opening packet, rather than after it.
      const worker = readerWorker();
      const options = await pdfOptions(href, session.controller.signal, progress, () => {
        if (current()) pages.replaceChildren(el("p", { class: "reader-msg", role: "status" }, "This file couldn't be opened. Check your connection, then close and try again."));
        if (session.task) session.task.destroy().catch(() => {});
      }, openingPromise);
      options.worker = worker;
      session.range = options.range;
      session.bytes = options.length || hostedFiles[href]?.size || 0;
      if (!current()) return;
      session.task = pdfjsLib.getDocument(options);
      session.task.onProgress = progress;
      const doc = await session.task.promise;
      if (!current()) { await doc.destroy(); return; }
      session.document = doc;
      }
      const doc = session.document;
      openDoc = doc;
      $("reader-download").disabled = false;
      rCount.textContent = `${doc.numPages} ${doc.numPages === 1 ? "page" : "pages"}`;
      const first = await doc.getPage(1);
      if (!current()) return;
      const vp = first.getViewport({ scale: 1 });
      const boxes = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const box = el("div", { class: "page", "data-page": String(i) });
        box.style.aspectRatio = `${vp.width} / ${vp.height}`;
        boxes.push(box);
      }
      pages.replaceChildren(...boxes);
      positions = readStore(positionKey, positions);
      const saved = positions[href];
      const pageNumber = Math.max(1, Math.min(doc.numPages, Number(saved?.page) || 1));
      const target = boxes[pageNumber - 1];
      const offset = Math.max(0, Math.min(0.99, Number(saved?.offset) || 0));
      // Measure the target page before restoration, including mixed-size PDF documents.
      const targetPage = await doc.getPage(pageNumber);
      if (!current()) return;
      const targetVP = targetPage.getViewport({scale:1});
      target.style.aspectRatio = `${targetVP.width} / ${targetVP.height}`;
      pages.scrollTop = target.offsetTop - pages.offsetTop + target.clientHeight * offset;
      session.ready = true;
      savePosition();
      // Restore the actual reading page first, before spending time on neighbours.
      await renderPage(doc, target, session);
      if (!current()) return;
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !e.target.dataset.rendered) session.pending.add(e.target);
          else if (!e.isIntersecting) session.pending.delete(e.target);
        }
        drainPages(session);
      }, { root: pages, rootMargin: "600px 0px" });
      boxes.forEach((b) => observer.observe(b));
    } catch {
      if (current()) pages.replaceChildren(el("p", { class: "reader-msg", role: "status" }, "This file couldn't be opened. Check your connection, then close and try again."));
    }
  }

  $("reader-download").addEventListener("click", async () => {
    const doc = openDoc;
    if (!doc) return;
    const button = $("reader-download");
    const title = rTitle.textContent;
    button.disabled = true;
    try {
      const data = await doc.getData();
      const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = (title || "document") + ".pdf";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { if (doc === openDoc) button.textContent = "Retry download"; }
    finally { if (doc === openDoc) button.disabled = false; }
  });

  async function drainPages(session) {
    if (session.rendering) return;
    session.rendering = true;
    try {
      while (session === readerSession && session.pending.size) {
        const box = [...session.pending].sort((a,b) => Math.abs(a.offsetTop-pages.scrollTop)-Math.abs(b.offsetTop-pages.scrollTop))[0];
        session.pending.delete(box);
        if (!box.dataset.rendered) await renderPage(session.document, box, session);
      }
    } finally { session.rendering = false; }
  }
  function prunePages() {
    const top = pages.getBoundingClientRect().top;
    const canvases = [...pages.querySelectorAll(".page[data-rendered] canvas")];
    canvases.sort((a,b) => Math.abs(a.parentElement.getBoundingClientRect().top-top)-Math.abs(b.parentElement.getBoundingClientRect().top-top));
    for (const canvas of canvases.slice(8)) {
      delete canvas.parentElement.dataset.rendered;
      canvas.width = canvas.height = 0;
      canvas.remove();
    }
  }
  async function renderPage(doc, box, session) {
    let task;
    try {
      if (session !== readerSession) return;
      const page = await doc.getPage(Number(box.dataset.page));
      if (session !== readerSession || !box.isConnected) return;
      const base = page.getViewport({scale:1});
      box.style.aspectRatio = `${base.width} / ${base.height}`;
      const scale = box.clientWidth / base.width * Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({scale});
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      box.replaceChildren(canvas);
      task = page.render({canvasContext:canvas.getContext("2d"), viewport:vp});
      session.renders.add(task);
      await task.promise;
      if (session !== readerSession) return;
      box.dataset.rendered = "true";
      prunePages();
    } catch (error) {
      if (session === readerSession && box.isConnected && error.name !== "RenderingCancelledException") box.replaceChildren(el("p", {class:"reader-msg"}, "This page couldn't be displayed. Close and reopen the book to try again."));
    } finally { if (task) session.renders.delete(task); }
  }

  function releaseReader() {
    savePosition();
    if (observer) observer.disconnect();
    const previous = readerSession;
    readerSession = null;
    if (previous) {
      previous.renders.forEach(task => task.cancel());
      previous.pending.clear();
      // A bounded in-memory cache accelerates returning to ongoing books. It is
      // never persisted and never holds more than 24 MiB of known PDF data.
      if (previous.document && previous.ready && previous.bytes > 0 && previous.bytes <= 24*1024*1024) {
        recentReaders.set(previous.href, previous);
        let total = [...recentReaders.values()].reduce((n,s) => n+s.bytes, 0);
        while (recentReaders.size > 2 || total > 24*1024*1024) {
          const [key,old] = recentReaders.entries().next().value;
          recentReaders.delete(key); total -= old.bytes; destroySession(old);
        }
      } else destroySession(previous);
    }
    pages.querySelectorAll("canvas").forEach(canvas => {canvas.width = canvas.height = 0;});
    openDoc = observer = null;
  }

  function savePosition() {
    const session = readerSession;
    if (!session?.ready) return;
    const top = pages.getBoundingClientRect().top;
    const boxes = [...pages.querySelectorAll(".page")];
    // Page placeholders are ordered; binary search avoids measuring hundreds of
    // pages on every progress save in long books.
    let low = 0, high = boxes.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (boxes[mid].getBoundingClientRect().bottom <= top + 1) low = mid + 1;
      else high = mid;
    }
    const box = boxes[low];
    if (!box) return;
    positions = readStore(positionKey, positions);
    positions[session.href] = {page:Number(box.dataset.page), offset:Math.max(0, Math.min(.99, (top - box.getBoundingClientRect().top) / box.clientHeight)), updated:Date.now()};
    store(positionKey, positions);
    rCount.textContent = `${box.dataset.page} / ${boxes.length}`;
    const item=itemByHref.get(session.href);
    if(item)item.querySelector(".study-progress").textContent=`Continue · page ${box.dataset.page}`;
  }
  let positionTimer;
  pages.addEventListener("scroll", () => { clearTimeout(positionTimer); positionTimer = setTimeout(savePosition, 150); }, {passive:true});
  window.addEventListener("pagehide", savePosition);
  document.addEventListener("visibilitychange", () => { if (document.hidden) savePosition(); });
  function updateStudyNavigation() {
    const active = readerSession?.study;
    $("study-navigation").hidden = !active;
    const i = selected.indexOf(readerSession?.href);
    $("study-prev").disabled = i <= 0;
    $("study-next").disabled = i < 0 || i >= selected.length - 1;
    $("study-index").textContent = `${i + 1} of ${selected.length}`;
  }
  function switchStudy(direction) {
    if (!readerSession?.study) return;
    const href = selected[selected.indexOf(readerSession.href) + direction];
    if (!href) return;
    const card = [...grid.querySelectorAll("a.card")].find(a => a.getAttribute("href") === href);
    if (!card) return;
    history.replaceState({libraryReader:true,href,title:card.dataset.title}, "");
    openReader(href, card.dataset.title, card, false);
  }
  $("study-prev").onclick = () => switchStudy(-1);
  $("study-next").onclick = () => switchStudy(1);
  let swipe;
  pages.addEventListener("touchstart", e => {
    swipe = e.touches.length === 1 && (visualViewport?.scale || 1) <= 1.05 && !String(getSelection()) ? {x:e.touches[0].clientX,y:e.touches[0].clientY,time:Date.now()} : null;
  }, {passive:true});
  pages.addEventListener("touchmove", e => {
    if (e.touches.length !== 1 || (swipe && Math.abs(e.touches[0].clientY - swipe.y) > 35)) swipe = null;
  }, {passive:true});
  pages.addEventListener("touchcancel", () => { swipe = null; }, {passive:true});
  pages.addEventListener("touchend", e => {
    const start = swipe; swipe = null;
    if (!start || e.touches.length || String(getSelection()) || (visualViewport?.scale || 1) > 1.05 || Date.now()-start.time > 900) return;
    const dx = e.changedTouches[0].clientX-start.x, dy = e.changedTouches[0].clientY-start.y;
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy)*3) switchStudy(dx < 0 ? 1 : -1);
  }, {passive:true});

  function hideReader() {
    releaseReader();
    reader.hidden = true;
    $("main").inert = false;
    document.body.classList.remove("reading");
    pages.replaceChildren();
    if (lastCard && !lastCard.closest("[hidden]")) lastCard.focus();
  }

  function closeReader() {
    if (reader.hidden) return;
    hideReader();
    if (history.state?.libraryReader) history.back();
  }

  window.addEventListener("popstate", () => {
    const state = history.state;
    if (state?.libraryReader) {
      const card = [...grid.querySelectorAll("a.card")].find(a => a.getAttribute("href") === state.href);
      if (card) openReader(state.href, state.title, card, false);
    } else if (!reader.hidden) hideReader();
  });

  grid.addEventListener("click", (e) => {
    if(Date.now()<suppressStudyClickUntil){e.preventDefault();return;}
    const a = e.target.closest("a.card");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openReader(a.getAttribute("href"), a.dataset.title, a);
  });
  $("reader-close").addEventListener("click", closeReader);
  document.addEventListener("keydown", (e) => {
    if (reader.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); closeReader(); }
    if (e.key === "Tab") {
      const controls = [...reader.querySelectorAll("button:not(:disabled), [tabindex='0']")];
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // A reload starts on the shelf, so discard an old reader history marker.
  if (history.state?.libraryReader) history.replaceState(null, "");
  fromHash();
  applyView();
})();
