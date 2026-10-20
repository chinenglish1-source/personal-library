# Mobile performance verification — 20 October 2026

Existing library and all 63 catalogue files retained. Existing study/position localStorage keys and voice IndexedDB schema unchanged. This is an incremental vanilla-JavaScript improvement, not a rewrite.

## Measured local results

Same HTTPS/range localhost server, Chrome Pixel 7 and WebKit iPhone 13 device profiles, three fresh contexts per engine, median wall time. Network unthrottled and service workers blocked for the comparison. These are laptop browser-engine measurements, not actual phone timings.

| Action | Chrome before | Chrome after | WebKit before | WebKit after |
| --- | ---: | ---: | ---: | ---: |
| DOM/interface startup | 58 ms | 52 ms | 45 ms | 34 ms |
| First book, first rendered page | 221 ms | 218 ms | 322 ms | 221 ms |
| First switch to another book | 201 ms | 213 ms | 209 ms | 211 ms |
| Return to an ongoing book | 214 ms | 111 ms | 208 ms | 51 ms |
| Close/reopen at page 50 | 215 ms | 110 ms | 321 ms | 49 ms |
| Hold to recording, synthetic mic | 1057 ms | 1043 ms | Not tested | Not tested |

The intentional one-second recording hold remains. New-book switching did not improve; returning to an already opened book did. Startup differences of a few milliseconds are within normal run-to-run variation. No claim of instant loading or reproduction of an iPhone black screen.

Scrolling to pages 10/20/30/40/50 previously retained 28 canvases; now retains eight completed canvases plus at most one rendering canvas. A bounded cache retains up to two previously opened PDF documents with at most 24 MiB of known source size; it never prefetches an unopened book. Larger books are released. The active book and PDF.js internal allocations are additional to this cache budget.

## Changes and checks

- Render the restored page before nearby pages; limit render concurrency and prune distant canvases.
- Reuse recently opened PDF documents in memory, with eviction and safe cancellation during rapid navigation.
- Binary search ordered page placeholders when saving progress, avoiding a linear layout scan of long books.
- Open voice storage concurrently with microphone permission; preserve hold/release and autosave safety.
- Correct the actual service-worker mismatch: HTML used v11 assets while its installation list still requested v10. All shell assets now use v13. Viewer code is cached when requested, rather than blocking shell installation.
- Verify Chrome and WebKit first/repeated standalone-mode launches, offline shell reopening, zero PDF requests at startup, matching cache assets, saved page 112 plus within-page offset, reload recovery, study swipes, vertical gesture protection, rapid switching and 320/375/390/430/768px layouts. No application errors in these checks.
- Verify returning to a cached book sends no new PDF request. Existing multipart range transport and explicit download implementation are preserved.
- Public GitHub Pages returned HTTP 200 before release; availability is separate from device startup latency.

## Limits

Physical iPhone home-screen cold/warm launches, iOS process suspension, real microphone permission/quality, interruption recovery and actual device memory pressure still require device testing. Standalone mode is simulated, not proof of installation. Synthetic touch events test handlers, not native Safari gesture arbitration. PDFs require internet unless separately downloaded; no books are automatically cached offline. Browser storage can be cleared or evicted, so voice exports remain useful backups.

## Public-network follow-up

The v12 release passed live Chrome and WebKit browser/standalone-mode checks, including first/repeated launches, real book rendering and returning to ongoing books. Live shell startup was 1.5–2.9 seconds cold and 26–46 ms repeated; first opening the tested 10.8 MB book was 9.9–35.7 seconds, returning 51–118 ms. These are four samples on this Mac/network, not phone guarantees.

Tracing found an initial whole-file metadata probe, followed by 22 small partial responses. A known-size transport removes that initial full-file request and requests only partial bytes. Sizes are recorded for all 63 catalogue PDFs; split parts keep their existing mapping. The final v13 release uses this transport with 64 KiB ranges. Live route-intercepted trials rendered the same book in 9.9 and 10.9 seconds using 1.41 MB of partial data, with no whole-file request. This is not a controlled before/after network benchmark and does not establish a universal speedup.

Larger 256 KiB chunks used 3.51 MB and took 11.4/16.5 seconds in the same transport; a 1 MiB experiment timed out. These experiments were not shipped. Initial uncached book opening remains network-dependent and can still be slow. No claim that cold iPhone loading is fixed.

## 21 October: fewer opening requests (v17)

The slow 10.8 MB book needed 22 separate source-range requests before its first page. Fifty-four PDFs now have small opening packets containing verified, unchanged source bytes from their initial-render ranges. The nine remaining PDFs continue using regular ranges. Total extra hosted data is 94,975,375 bytes; none is downloaded at app startup. A packet is fetched only for the chosen book, alongside PDF-worker startup. Missing, malformed and failed packets fall back to regular range loading. Packets are capped at 12 MiB; no entire library preload or new cloud storage was added.

Controlled Chrome Pixel 7 simulation, fresh contexts, HTTPS localhost, 120 ms latency and 750,000 bytes/sec: first-page times before 7,354/7,341 ms; after 4,326/4,320 ms. About 41 percent faster in this specific test, with 22 PDF source requests replaced by one opening-packet request and approximately the same 1.41 MB transferred. This is a simulated connection, not an iPhone measurement or a universal timing promise.

All 54 packet bodies were checked byte-for-byte against their unchanged originals. Chrome and WebKit passed page-112 restoration after close/reload, fractional offset, cached reopening without network requests, missing/corrupt-packet fallback, rapid switching, swipes, offline shell and mobile widths. A v11-to-v17 cache upgrade retained selections, progress and a voice record. Single-file downloads (including an 18 MB PDF) and a split 22 MB PDF matched original SHA-256 hashes. The loader also corrects single-file PDFs larger than 16 MiB, which previously could be treated as if split.

Saved positions retain the original per-book keys and do not expire. Real iPhone startup, microphone and OS lifecycle checks remain outstanding.

Shell installation now uses reload requests so fresh HTML and scripts replace stale browser-cache copies. An upgrade test with one-hour HTTP caching verified fresh HTML plus preserved page 112, study selection and voice metadata.
