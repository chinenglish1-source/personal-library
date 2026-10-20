(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), empty = $("empty"), status = $("status");
  const langBtns = [...$("langs").querySelectorAll("button")];
  const tabBtns = [...$("tabs").querySelectorAll("button")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const TEXT = { study: "Studying now", book: "Books", doc: "Docs", empty: "Nothing here yet." };

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
      const button = el("button", {type:"button", class:"study-toggle", "data-href":it.link}, "Add to Studying now");
      button.addEventListener("click", () => {
        const next = selected.includes(it.link) ? selected.filter(h => h !== it.link) : [...selected, it.link];
        if (store(studyKey, next)) { selected = next; applyView(); }
      });
      li.append(button);
    }
    return li;
  }

  const items = LIBRARY
    .slice()
    .map((it) => it.kind === "book" && it.type !== "PDF" ? { ...it, kind: "doc" } : it)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map(card);
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
    const t = TEXT;
    langBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
    tabBtns.forEach((b) => {
      b.textContent = t[b.dataset.kind];
      b.setAttribute("aria-pressed", String(b.dataset.kind === kind));
    });
    $("langs").hidden = kind === "study";

    for (const li of items) {
      const button = li.querySelector(".study-toggle");
      const active = button && selected.includes(button.dataset.href);
      if (button) { button.textContent = active ? "Remove from study" : "Add to Studying now"; button.setAttribute("aria-pressed", String(active)); }
      li.hidden = kind === "study" ? !active : li.dataset.lang !== lang || li.dataset.kind !== kind;
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
    if (nextLang === lang && nextKind === kind) return;
    lang = nextLang; kind = nextKind;
    try { history.replaceState(null, "", location.pathname + location.search + `#${lang}-${kind}`); } catch {}
    applyView();
  }

  langBtns.forEach((b) => b.addEventListener("click", () => setView(b.dataset.lang, kind)));
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
  arrowNav(langBtns, (b) => setView(b.dataset.lang, kind));
  arrowNav(tabBtns, (b) => setView(lang, b.dataset.kind));

  window.addEventListener("hashchange", () => { fromHash(); applyView(); });

  /* Reader — files open inside the page, rendered with PDF.js. */
  const reader = $("reader"), pages = $("pages"), rTitle = $("reader-title"), rCount = $("reader-count");
  let openDoc = null, observer = null, lastCard = null, thumbObserver = null;
  let readerSession = null;
  let pdfPromise;
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
  const hostedFiles = {"files/02.pdf":{"cover":"covers/02.jpg"},"files/03.pdf":{"cover":"covers/03.jpg"},"files/04.pdf":{"cover":"covers/04.jpg"},"files/05.pdf":{"cover":"covers/05.jpg"},"files/06.pdf":{"cover":"covers/06.jpg"},"files/07.pdf":{"cover":"covers/07.jpg"},"files/12.pdf":{"cover":"covers/12.jpg"},"files/13.pdf":{"cover":"covers/13.jpg"},"files/14.pdf":{"cover":"covers/14.jpg"},"files/15.pdf":{"cover":"covers/15.jpg"},"files/16.pdf":{"cover":"covers/16.jpg"},"files/17.pdf":{"cover":"covers/17.jpg"},"files/18.pdf":{"cover":"covers/18.jpg"},"files/19.pdf":{"cover":"covers/19.jpg"},"files/20.pdf":{"cover":"covers/20.jpg"},"files/21.pdf":{"cover":"covers/21.jpg"},"files/22.pdf":{"cover":"covers/22.jpg"},"files/23.pdf":{"cover":"covers/23.jpg","parts":["files/23.part00","files/23.part01","files/23.part02"],"size":34244995},"files/24.pdf":{"cover":"covers/24.jpg"},"files/25.pdf":{"cover":"covers/25.jpg"},"files/26.pdf":{"cover":"covers/26.jpg"},"files/27.pdf":{"cover":"covers/27.jpg"},"files/28.pdf":{"cover":"covers/28.jpg"},"files/29.pdf":{"cover":"covers/29.jpg"},"files/30.pdf":{"cover":"covers/30.jpg"},"files/31.pdf":{"cover":"covers/31.jpg"},"files/32.pdf":{"cover":"covers/32.jpg","parts":["files/32.part00","files/32.part01"],"size":26922223},"files/33.pdf":{"cover":"covers/33.jpg"},"files/34.pdf":{"cover":"covers/34.jpg"},"files/35.pdf":{"cover":"covers/35.jpg"},"files/36.pdf":{"cover":"covers/36.jpg"},"files/37.pdf":{"cover":"covers/37.jpg"},"files/38.pdf":{"cover":"covers/38.jpg"},"files/39.pdf":{"cover":"covers/39.jpg"},"files/40.pdf":{"cover":"covers/40.jpg"},"files/41.pdf":{"cover":"covers/41.jpg","parts":["files/41.part00","files/41.part01"],"size":24559661},"files/42.pdf":{"cover":"covers/42.jpg","parts":["files/42.part00","files/42.part01"],"size":25666603},"files/43.pdf":{"cover":"covers/43.jpg","parts":["files/43.part00","files/43.part01","files/43.part02","files/43.part03"],"size":58653288},"files/44.pdf":{"cover":"covers/44.jpg","parts":["files/44.part00","files/44.part01"],"size":32435559},"files/45.pdf":{"cover":"covers/45.jpg"},"files/46.pdf":{"cover":"covers/46.jpg"},"files/47.pdf":{"cover":"covers/47.jpg"},"files/48.pdf":{"cover":"covers/48.jpg"},"files/49.pdf":{"cover":"covers/49.jpg"},"files/50.pdf":{"cover":"covers/50.jpg"},"files/51.pdf":{"cover":"covers/51.jpg"},"files/52.pdf":{"cover":"covers/52.jpg"},"files/53.pdf":{"cover":"covers/53.jpg","parts":["files/53.part00","files/53.part01"],"size":21887641},"files/54.pdf":{"cover":"covers/54.jpg"},"files/55.pdf":{"cover":"covers/55.jpg","parts":["files/55.part00","files/55.part01"],"size":25476788},"files/56.pdf":{"cover":"covers/56.jpg"},"files/57.pdf":{"cover":"covers/57.jpg"},"files/58.pdf":{"cover":"covers/58.jpg","parts":["files/58.part00","files/58.part01","files/58.part02"],"size":47579454},"files/59.pdf":{"cover":"covers/59.jpg"},"files/60.pdf":{"cover":"covers/60.jpg"},"files/61.pdf":{"cover":"covers/61.jpg"},"files/62.pdf":{"cover":"covers/62.jpg"},"files/63.pdf":{"cover":"covers/63.jpg"},"files/64.pdf":{"cover":"covers/64.jpg"},"files/65.pdf":{"cover":"covers/65.jpg","parts":["files/65.part00","files/65.part01"],"size":28715989},"files/66.pdf":{"cover":"covers/66.jpg","parts":["files/66.part00","files/66.part01"],"size":22573201},"files/67.pdf":{"cover":"covers/67.jpg"},"files/68.pdf":{"cover":"covers/68.jpg"}};
  async function pdfOptions(url, signal, progress, onError) {
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
    if (!file || !file.parts) return { ...options, url };
    // Published parts are 16 MiB. Map PDF.js byte ranges across their boundaries.
    const partSize = 16 * 1024 * 1024;
    const controller = new AbortController();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", () => controller.abort(), { once: true });
    const range = new pdfjsLib.PDFDataRangeTransport(file.size, new Uint8Array(0));
    const wholeParts = new Map();
    let loaded = 0;
    range.abort = () => controller.abort();
    range.requestDataRange = (begin, end) => {
      range.started = true;
      (async () => {
        const bytes = new Uint8Array(end - begin);
        const requests = [];
        for (let index = Math.floor(begin / partSize); index <= Math.floor((end - 1) / partSize); index++) {
          requests.push((async () => {
            const partStart = index * partSize;
            const start = Math.max(begin - partStart, 0);
            const stop = Math.min(end - partStart, partSize, file.size - partStart);
            let data = wholeParts.get(index);
            if (data) data = data.subarray(start, stop);
            else {
              const response = await fetch(file.parts[index], {
                signal: controller.signal,
                headers: { Range: `bytes=${start}-${stop - 1}` },
              });
              if (!response.ok) throw new Error("File unavailable");
              data = new Uint8Array(await response.arrayBuffer());
              if (response.status === 200) {
                // Hosts without range support can still serve the complete part.
                if (data.length !== Math.min(partSize, file.size - partStart)) throw new Error("Incomplete file part");
                wholeParts.set(index, data);
                data = data.subarray(start, stop);
              } else if (response.status !== 206 || response.headers.get("Content-Range") !== `bytes ${start}-${stop - 1}/${Math.min(partSize, file.size - partStart)}`) {
                throw new Error("Invalid file range");
              }
            }
            if (data.length !== stop - start) throw new Error("Incomplete file range");
            bytes.set(data, partStart + start - begin);
          })());
        }
        await Promise.all(requests);
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
    const session = { controller: new AbortController(), task: null, href, study: kind === "study", ready: false };
    readerSession = session;
    lastCard = card;
    if (addHistory) history.pushState({ libraryReader: true, href, title }, "");
    updateStudyNavigation();
    const current = () => readerSession === session;
    const progress = ({ loaded, total }) => {
      if (!current()) return;
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
      await loadPDF();
      if (!current()) return;
      const options = await pdfOptions(href, session.controller.signal, progress, () => {
        if (current()) pages.replaceChildren(el("p", { class: "reader-msg", role: "status" }, "This file couldn't be opened. Check your connection, then close and try again."));
        if (session.task) session.task.destroy().catch(() => {});
      });
      session.range = options.range;
      if (!current()) return;
      session.task = pdfjsLib.getDocument(options);
      session.task.onProgress = progress;
      const doc = await session.task.promise;
      if (!current()) { await doc.destroy(); return; }
      session.document = doc;
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
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { observer.unobserve(e.target); renderPage(doc, e.target); }
      }, { root: pages, rootMargin: "800px 0px" });
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

  async function renderPage(doc, box) {
    try {
      if (doc !== openDoc) return;
      const page = await doc.getPage(Number(box.dataset.page));
      if (doc !== openDoc || !box.isConnected) return;
      const base = page.getViewport({ scale: 1 });
      box.style.aspectRatio = `${base.width} / ${base.height}`;
      const scale = (box.clientWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(vp.width));
      canvas.height = Math.max(1, Math.floor(vp.height));
      box.replaceChildren(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      box.dataset.rendered = "true";
    } catch {
      if (doc === openDoc && box.isConnected) box.replaceChildren(el("p", { class: "reader-msg" }, "This page couldn't be displayed. Close and reopen the book to try again."));
    }
  }

  function releaseReader() {
    savePosition();
    if (observer) observer.disconnect();
    const previous = readerSession;
    readerSession = null;
    if (previous) {
      previous.controller.abort();
      if (previous.task && (previous.document || previous.range?.started)) previous.task.destroy().catch(() => {});
    }
    openDoc = observer = null;
  }

  function savePosition() {
    const session = readerSession;
    if (!session?.ready) return;
    const top = pages.getBoundingClientRect().top;
    const boxes = [...pages.querySelectorAll(".page")];
    const box = boxes.find(b => b.getBoundingClientRect().bottom > top + 1) || boxes.at(-1);
    if (!box) return;
    positions = readStore(positionKey, positions);
    positions[session.href] = {page:Number(box.dataset.page), offset:Math.max(0, Math.min(.99, (top - box.getBoundingClientRect().top) / box.clientHeight)), updated:Date.now()};
    store(positionKey, positions);
    rCount.textContent = `${box.dataset.page} / ${boxes.length}`;
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
    savePosition();
    reader.hidden = true;
    $("main").inert = false;
    document.body.classList.remove("reading");
    if (readerSession) readerSession.ready = false;
    releaseReader();
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
