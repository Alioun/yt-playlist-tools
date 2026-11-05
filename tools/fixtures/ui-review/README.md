# Review the extension pages

From the repository root, run `node node_modules/vite/bin/vite.js tools/fixtures/ui-review --config tools/fixtures/ui-review/vite.config.ts`.
Open `http://localhost:5173/?view=popup`, `?view=settings`, `?view=onboarding`, or `?view=picker`.

This fixture mounts production components, styles, localization, and picker models over synthetic data. It does not connect to YouTube or extension storage and does not ship in the extension.
The fixture supplies `crypto.randomUUID` from `getRandomValues` when an HTTP preview proxy lacks the secure-context method; production extension pages use the browser's own method.

- Popup and settings scenarios: `ready` (default), `fresh`, `held`, `private`, `signed-out`, `paused`, and `error` (feature switches refuse the write).
- `long-list` supplies 12 playlists for the auto-add search. `choice-refusal` supplies the same list and refuses auto-add choices with `sync-full`; both work in the popup's expanded Auto-add row and in Settings.
- `theme=light|dark` and `site=www|music` set the initial theme and active site.
- Onboarding uses the scenarios from `ui-foundation`; picker uses those from `picker-ui`.
- Settings sections use their production hashes, such as `?view=settings#appearance`.

Feature switches, themes, percentage changes, Pause, and skipping the current video update synthetic state. Other option writes return an unconfirmed refusal. Unsupported writes throw a fixture error. External links record their destination in `document.documentElement.dataset.lastOpenedUrl`. Onboarding and picker actions use their existing synthetic owners. These simulations support visual and interaction review; the production behavioral tests verify real operation outcomes.
Each view loads its production stylesheet separately, preserving the production CSS cascade.

`?view=onboarding-host` uses production `OnboardingPage`, `startFirstRun`, the backend owner, and `PickerHost`. Select Auto-add and Quick-save, continue, agree, then use each Finish-step Choose button. Unlike the basic onboarding fixture, this opens the real lazy-mounted modal and saves choices through production picker adapters. Destination and auto-add writes update synthetic records; `scenario=choice-refusal` returns sync-full instead. This proves the host and its wiring, not authenticated YouTube writes.

For the installed extension, build Chrome and run `node tools/fixtures/ui-review/check-live.mjs` from the repository root. Playwright's full Chromium must be installed (`node node_modules/playwright/cli.js install chromium`). An optional first argument selects the report directory; otherwise the runner creates a unique directory under the system temp directory. It uses a fresh isolated browser profile, enables three features through production onboarding, and checks the watch menu's signed-out recovery and search-result thumbnail controls on real YouTube. It captures screenshots and JSON, returns a failing exit status on an unsuccessful check, and closes its browser. It does not sign in or change an account's playlists. Network access is required. YouTube's live markup, availability, and language can affect the check.

When Finish initially needs a YouTube tab, the runner also uses Open YouTube and checks that returning updates Finish to Sign in. Headless Chromium keeps every tab marked focused/visible and emits no return event from `bringToFront`, so the runner explicitly dispatches the focus event and records that simulation in `returnEvent`. The extension's setup/account reads still use its native backend and the real YouTube tabs. This checks the production return handler, not desktop window-manager event delivery.
