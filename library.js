(() => {
  const $ = (id) => document.getElementById(id);
  const grid = $("grid"), empty = $("empty"), status = $("status");
  const langBtns = [...$("langs").querySelectorAll("button")];
  const tabBtns = [...$("tabs").querySelectorAll("button")];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const TEXT = { book: "Books", doc: "Docs", empty: "Nothing here yet." };

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v; else n.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) n.append(k);
    return n;
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
    return li;
  }

  const items = LIBRARY
    .slice()
    .map((it) => it.kind === "book" && it.type !== "PDF" ? { ...it, kind: "doc" } : it)
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .map(card);
  grid.append(...items);

  let lang = "ar", kind = "book";

  function fromHash() {
    const m = /^#(ar|en)-(book|note|doc)$/.exec(location.hash);
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
    for (const li of items) li.hidden = li.dataset.lang !== lang || li.dataset.kind !== kind;
    updateStatus();
  }

  function updateStatus() {
    const t = TEXT;
    const inView = items.filter((li) => !li.hidden);
    grid.hidden = !inView.length;
    if (!inView.length) { empty.hidden = false; empty.textContent = status.textContent = t.empty; return; }
    empty.hidden = true;
    status.textContent = String(inView.length);
  }

  let fadeTimer;
  function setView(nextLang, nextKind) {
    if (nextLang === lang && nextKind === kind) return;
    lang = nextLang; kind = nextKind;
    try { history.replaceState(null, "", location.pathname + location.search + `#${lang}-${kind}`); } catch {}
    clearTimeout(fadeTimer);
    if (reduceMotion.matches) { applyView(); return; }
    grid.classList.add("is-fading");
    fadeTimer = setTimeout(() => {
      applyView();
      requestAnimationFrame(() => grid.classList.remove("is-fading"));
    }, 140);
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
  if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

  const hosted = true;
  const hostedFiles = {"files/02.pdf":{"cover":"covers/02.jpg"},"files/03.pdf":{"cover":"covers/03.jpg"},"files/04.pdf":{"cover":"covers/04.jpg"},"files/05.pdf":{"cover":"covers/05.jpg"},"files/06.pdf":{"cover":"covers/06.jpg"},"files/07.pdf":{"cover":"covers/07.jpg"},"files/12.pdf":{"cover":"covers/12.jpg"},"files/13.pdf":{"cover":"covers/13.jpg"},"files/14.pdf":{"cover":"covers/14.jpg"},"files/15.pdf":{"cover":"covers/15.jpg"},"files/16.pdf":{"cover":"covers/16.jpg"},"files/17.pdf":{"cover":"covers/17.jpg"},"files/18.pdf":{"cover":"covers/18.jpg"},"files/19.pdf":{"cover":"covers/19.jpg"},"files/20.pdf":{"cover":"covers/20.jpg"},"files/21.pdf":{"cover":"covers/21.jpg"},"files/22.pdf":{"cover":"covers/22.jpg"},"files/23.pdf":{"cover":"covers/23.jpg","parts":["files/23.part00","files/23.part01","files/23.part02"],"size":34244995},"files/24.pdf":{"cover":"covers/24.jpg"},"files/25.pdf":{"cover":"covers/25.jpg"},"files/26.pdf":{"cover":"covers/26.jpg"},"files/27.pdf":{"cover":"covers/27.jpg"},"files/28.pdf":{"cover":"covers/28.jpg"},"files/29.pdf":{"cover":"covers/29.jpg"},"files/30.pdf":{"cover":"covers/30.jpg"},"files/31.pdf":{"cover":"covers/31.jpg"},"files/32.pdf":{"cover":"covers/32.jpg","parts":["files/32.part00","files/32.part01"],"size":26922223},"files/33.pdf":{"cover":"covers/33.jpg"},"files/34.pdf":{"cover":"covers/34.jpg"},"files/35.pdf":{"cover":"covers/35.jpg"},"files/36.pdf":{"cover":"covers/36.jpg"},"files/37.pdf":{"cover":"covers/37.jpg"},"files/38.pdf":{"cover":"covers/38.jpg"},"files/39.pdf":{"cover":"covers/39.jpg"},"files/40.pdf":{"cover":"covers/40.jpg"},"files/41.pdf":{"cover":"covers/41.jpg","parts":["files/41.part00","files/41.part01"],"size":24559661},"files/42.pdf":{"cover":"covers/42.jpg","parts":["files/42.part00","files/42.part01"],"size":25666603},"files/43.pdf":{"cover":"covers/43.jpg","parts":["files/43.part00","files/43.part01","files/43.part02","files/43.part03"],"size":58653288},"files/44.pdf":{"cover":"covers/44.jpg","parts":["files/44.part00","files/44.part01"],"size":32435559},"files/45.pdf":{"cover":"covers/45.jpg"},"files/46.pdf":{"cover":"covers/46.jpg"},"files/47.pdf":{"cover":"covers/47.jpg"},"files/48.pdf":{"cover":"covers/48.jpg"},"files/49.pdf":{"cover":"covers/49.jpg"},"files/50.pdf":{"cover":"covers/50.jpg"},"files/51.pdf":{"cover":"covers/51.jpg"},"files/52.pdf":{"cover":"covers/52.jpg"},"files/53.pdf":{"cover":"covers/53.jpg","parts":["files/53.part00","files/53.part01"],"size":21887641},"files/54.pdf":{"cover":"covers/54.jpg"},"files/55.pdf":{"cover":"covers/55.jpg","parts":["files/55.part00","files/55.part01"],"size":25476788},"files/56.pdf":{"cover":"covers/56.jpg"},"files/57.pdf":{"cover":"covers/57.jpg"},"files/58.pdf":{"cover":"covers/58.jpg","parts":["files/58.part00","files/58.part01","files/58.part02"],"size":47579454},"files/59.pdf":{"cover":"covers/59.jpg"},"files/60.pdf":{"cover":"covers/60.jpg"},"files/61.pdf":{"cover":"covers/61.jpg"},"files/62.pdf":{"cover":"covers/62.jpg"},"files/63.pdf":{"cover":"covers/63.jpg"},"files/64.pdf":{"cover":"covers/64.jpg"},"files/65.pdf":{"cover":"covers/65.jpg","parts":["files/65.part00","files/65.part01"],"size":28715989},"files/66.pdf":{"cover":"covers/66.jpg","parts":["files/66.part00","files/66.part01"],"size":22573201},"files/67.pdf":{"cover":"covers/67.jpg"},"files/68.pdf":{"cover":"covers/68.jpg"}};
  async function pdfOptions(url) {
    const options = {
      isEvalSupported: false,
      cMapUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts/",
    };
    const file = hosted && hostedFiles[url];
    if (!file || !file.parts) return { ...options, url };
    const data = new Uint8Array(file.size);
    let offset = 0;
    for (const part of file.parts) {
      const response = await fetch(part);
      if (!response.ok) throw new Error("File unavailable");
      const bytes = new Uint8Array(await response.arrayBuffer());
      data.set(bytes, offset); offset += bytes.length;
    }
    if (offset !== file.size) throw new Error("Incomplete file");
    return { ...options, data };
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

  if (window.pdfjsLib) {
    thumbObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        thumbObserver.unobserve(entry.target);
        renderThumbnail(entry.target);
      }
    }, { rootMargin: "600px 0px" });
    document.querySelectorAll(".preview").forEach((box) => thumbObserver.observe(box));
  }

  async function openReader(href, title, card) {
    lastCard = card;
    $("reader-download").disabled = true;
    rTitle.textContent = title;
    rCount.textContent = "";
    pages.replaceChildren(el("p", { class: "reader-msg" }, "Opening…"));
    reader.hidden = false;
    document.body.classList.add("reading");
    $("reader-close").focus();
    if (!window.pdfjsLib) { pages.replaceChildren(el("p", { class: "reader-msg" }, "Viewer failed to load.")); return; }
    try {
      const doc = await pdfjsLib.getDocument(await pdfOptions(href)).promise;
      if (reader.hidden) { doc.destroy(); return; }
      openDoc = doc;
      $("reader-download").disabled = false;
      rCount.textContent = `${doc.numPages} ${doc.numPages === 1 ? "page" : "pages"}`;
      const first = await doc.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      const boxes = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const box = el("div", { class: "page", "data-page": String(i) });
        box.style.aspectRatio = `${vp.width} / ${vp.height}`;
        boxes.push(box);
      }
      pages.replaceChildren(...boxes);
      pages.scrollTop = 0;
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) { observer.unobserve(e.target); renderPage(doc, e.target); }
      }, { root: pages, rootMargin: "800px 0px" });
      boxes.forEach((b) => observer.observe(b));
    } catch (err) {
      pages.replaceChildren(el("p", { class: "reader-msg" }, "This file couldn't be opened."));
    }
  }

  $("reader-download").addEventListener("click", async () => {
    const doc = openDoc;
    if (!doc) return;
    const button = $("reader-download");
    button.disabled = true;
    try {
      const data = await doc.getData();
      const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = (rTitle.textContent || "document") + ".pdf";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch { button.textContent = "Retry download"; }
    finally { button.disabled = !openDoc; }
  });

  async function renderPage(doc, box) {
    if (doc !== openDoc) return;
    const page = await doc.getPage(Number(box.dataset.page));
    const base = page.getViewport({ scale: 1 });
    box.style.aspectRatio = `${base.width} / ${base.height}`;
    const scale = (box.clientWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width);
    canvas.height = Math.floor(vp.height);
    box.replaceChildren(canvas);
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  }

  function closeReader() {
    if (reader.hidden) return;
    reader.hidden = true;
    document.body.classList.remove("reading");
    if (observer) observer.disconnect();
    if (openDoc) openDoc.destroy();
    openDoc = observer = null;
    pages.replaceChildren();
    if (lastCard) lastCard.focus();
  }

  grid.addEventListener("click", (e) => {
    const a = e.target.closest("a.card");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    openReader(a.getAttribute("href"), a.dataset.title, a);
  });
  $("reader-close").addEventListener("click", closeReader);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !reader.hidden) closeReader(); });

  fromHash();
  applyView();
})();
