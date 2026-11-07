# Verify the reported thumbnail and onboarding issues

Run `node tools/fixtures/reported-issues/check-browser.mjs` from the repository root.
An optional argument selects the evidence directory. The default is a new directory under the system temp directory.
Playwright's Chromium must already be installed.

The runner builds production components with the same injected Svelte styles as the page popovers. It mounts the real page-picker renderer in an isolated shadow root, using synthetic playlists, and mounts production onboarding with its synthetic owner. Browser requests are fulfilled from the local build; external requests are blocked. No server, YouTube account, or extension storage is used.

The assertions cover:

- Readable playlist names, the font, opaque theme background, close button, and sort switch with both 10px and 16px document roots.
- Searching the real picker model.
- All eleven feature examples appearing before selection in light and dark themes, at 360px and 1024px widths.
- Clicking an example selecting only its own feature and no horizontal overflow.

The evidence directory contains screenshots and `results.json`. This verifies rendering and local interactions. It does not verify signed-in YouTube requests or YouTube Music compatibility.

Behavioral regressions also live in `src/site/features/queue-button/queue-button.bun-test.ts`, `src/page/live-reads.bun-test.ts`, `src/background/accounts/account-label-owner.bun-test.ts`, and the onboarding and settings component tests. The gateway-playlists fixture checks that a missing account label stays unavailable instead of becoming a made-up persisted name.
