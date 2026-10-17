# Muhammad’s Library

Public website: https://chinenglish1-source.github.io/personal-library/

## Share and install

Send the website link through WeChat, WhatsApp, Telegram, email, or any chat. Opening the link in a browser shows Add to home screen and Read on site. Choosing either dismisses the entry chooser. Browser/OS confirmation or manual Safari steps are still required for installation. Opening the installed home-screen web app skips the chooser. No sign-in is required to read. There are no Share, Help or Install controls in the library itself.

- iPhone/iPad: open the link in Safari, tap Share → Add to Home Screen → Add. Enable Open as Web App if offered.
- Android: open in Chrome, tap ⋮ → Install app / Add to Home screen.
- Desktop: use the browser’s Install app option if available.

This is an installable web app (PWA), not an App Store or Play Store listing. Installation must be completed by each device owner. The catalogue is cached after the first successful visit. PDF pages load on demand using byte ranges. PDFs require internet; download them to keep offline copies. Back closes the reader and returns to the shelf. Browser storage can be cleared or evicted by the device.

## Make changes

This directory is the publishing source. Ask Codex to edit the library here and publish it, or edit:

- `catalog.js`: titles, authors, language and Books/Docs grouping.
- `index.html`: layout and appearance.
- `library.js`: reader behavior and the `hostedFiles` map for PDFs and split parts.
- `files/`, `covers/`: document assets and cover images.
- `app.js`, `manifest.webmanifest`, `sw.js`, `icons/`: sharing, installation and offline catalogue.

For a new PDF: add the file (split files larger than 16 MiB into exactly 16 MiB parts except the final part, using the existing naming pattern), add its cover, add a catalogue record and its hostedFiles entry. Never add private documents: every committed file is public, including Git history.

Preview with `python3 -m http.server 8816 --directory .`, open http://localhost:8816/, and check the shelf and reader. Commit only the intended files and push `HEAD:main` to `origin`. GitHub Pages publishes main’s root automatically. Check the live URL after the build succeeds. Increment the cache version in `sw.js` when changing the offline shell. Installed apps get web updates when reopened online; no app-store release is needed.

## Security and hosting limits

- HTTPS is enforced by GitHub Pages. This site has no database, login, public upload, payment form, secret or server-side admin endpoint.
- JavaScript is served locally; a restrictive HTML Content Security Policy blocks inline scripts, eval, object embeds, form submissions and unexpected connections.
- PDF.js 3.11.174 has the Mozilla-documented `isEvalSupported: false` mitigation for CVE-2024-4367. Its worker is local. Continue reviewing dependency advisories during maintenance.
- The `_headers` file is a leftover from another host; GitHub Pages does not apply it. The HTML policy and GitHub’s actual response headers are what matter.
- Public files can be copied, indexed or scraped. There is no guarantee against bots, DDoS or downtime. Client-side code cannot provide effective server-side bot filtering. GitHub controls this hosting layer; high traffic can hit GitHub Pages limits.
- Advanced bot challenges, configurable rate limits or private access require additional hosting/proxy setup and possibly a custom domain. They have not been configured here. Do not add CAPTCHA scripts that pretend to protect publicly accessible PDF URLs.
- GitHub account security (including two-factor authentication) is managed separately by the account owner. This work does not certify the account’s security settings.
