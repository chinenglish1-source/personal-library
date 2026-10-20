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
- Correct the actual service-worker mismatch: HTML used v11 assets while its installation list still requested v10. All shell assets now use v12. Viewer code is cached when requested, rather than blocking shell installation.
- Verify Chrome and WebKit first/repeated standalone-mode launches, offline shell reopening, zero PDF requests at startup, matching cache assets, saved page 112 plus within-page offset, reload recovery, study swipes, vertical gesture protection, rapid switching and 320/375/390/430/768px layouts. No application errors in these checks.
- Verify returning to a cached book sends no new PDF request. Existing multipart range transport and explicit download implementation are preserved.
- Public GitHub Pages returned HTTP 200 before release; availability is separate from device startup latency.

## Limits

Physical iPhone home-screen cold/warm launches, iOS process suspension, real microphone permission/quality, interruption recovery and actual device memory pressure still require device testing. Standalone mode is simulated, not proof of installation. Synthetic touch events test handlers, not native Safari gesture arbitration. PDFs require internet unless separately downloaded; no books are automatically cached offline. Browser storage can be cleared or evicted, so voice exports remain useful backups.
