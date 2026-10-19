# UI stacks for 2.0

Research for [ticket 05](../../.scratch/rebuild/issues/05-ui-stacks.md) of the 2.0 rebuild map. The user makes the decision in ticket 13.

- **Date:** 2026-10-19. Package versions are the npm `latest` tags on that date.
- **Scope:** the popup (340 px), the settings page, and the in-page UI that sits in a shadow root on youtube.com.
- **Sources:** every claim links to a primary source: official docs, repos, issue trackers, npm, or YouTube's own served files. Measurements made for this note are marked **[measured]** and described under [Method](#method). Anything not confirmed is marked **UNVERIFIED**.

## Answer

**Shortlist, in order:**

1. **shadcn/ui on Base UI** (React 19 + Tailwind v4): what the extension uses today, updated.
   - **For:**
     - Of all the React primitive libraries, Base UI has the best shadow-root track record. Every portal accepts a `ShadowRoot`, dismissal uses `composedPath()`, and about ten shadow-DOM fixes have shipped with nothing real left open.
     - It has been shadcn's default base since July 2026.
     - MUI releases it monthly.
     - It already passes this repo's happy-dom tests, and it runs under `bun test` with no setup **[measured]**.
     - Its Toast portals into the shadow root and injects no `<style>`, which fixes Sonner's habit of writing into YouTube's `<head>`.
   - **Against:**
     - Its primitives are the heaviest of the React headless libraries, about 1.7–1.9× Radix per component.
     - React's runtime alone is about 66 KB gzip.
     - Preact is still not a real option (see [Preact](#preact)).
2. **shadcn/ui on React Aria** (React 19 + Tailwind v4): the same shadcn styles and workflow, on Adobe's primitives.
   - **For:**
     - React Aria has the strongest published accessibility testing of any candidate: VoiceOver, JAWS, NVDA and TalkBack, 30+ locales, and touch handling.
     - It ships monthly.
     - shadcn has offered it as a first-class base since July 2026.
   - **Against:**
     - Shadow-DOM support is behind an experimental, undocumented flag. The RFC calls it "hacky" and assumes a single root.
     - It writes `<style>` tags into YouTube's `<head>`.
     - Its Toast API is still `UNSTABLE_`.
     - It was slower than Base UI on first render in the benchmark **[measured]**.
3. **Svelte 5 + shadcn-svelte (Bits UI)**: the only other-framework stack that clearly beats React here.
   - **For:**
     - Half the JavaScript (60 vs 121 KB gzip) and roughly 35–40% faster first render than option 1 **[measured]**.
     - shadcn's look comes along (shadcn-svelte tracks the styles).
     - A single `BitsConfig defaultPortalTo` points every portal at the shadow root.
     - The WXT module is maintained.
   - **Against:**
     - Every component and test is rewritten.
     - Bits UI is mostly one maintainer, and the ecosystem is smaller.
     - `bun test` needs a ~20-line compile plugin plus `--conditions browser` **[measured]**.
     - A focus-trap regression in nested shadow roots is still open.

**Nothing found beats shadcn on polish for this project, so I recommend no replacement.** Option 3 is the only one worth an "ask me", and its case is weight and speed, not looks.

- The fully styled kits are heavier and slower. In the benchmark, Mantine, HeroUI, Radix Themes and Chakra render in 105–193 ms against 87 ms for Base UI **[measured]**.
- They also bring their own design language, which would have to be overridden inside YouTube anyway.
- Each has a shadow-root or maintenance problem (see [Not shortlisted](#not-shortlisted)).

**One stack or two? One stack with two skins is better.** Use one framework and one primitives layer for all three surfaces:

- **Popup and settings:** shadcn's styled components with the extension's own tokens, as today.
- **In-page:** the same primitives (Popover, Menu, Toast, Button), styled with a small hand-written "YouTube skin":
  - YouTube's own `--yt-sys-color-baseline--*` custom properties. They inherit into the shadow root and follow YouTube's dark mode on their own.
  - `"YouTube Sans", Roboto`.
  - px-based sizing, because YouTube sets `<html>` to `font-size: 62.5%` (see [YouTube's look](#youtubes-look)).

Why one stack:

- The settled decision is that the in-page UI looks like YouTube, not like a component library, so a second library adds nothing visually.
- What in-page UI needs is behaviour that works in a shadow root: positioning, focus, dismissal and toasts. Those are the same primitives the popup uses.
- Two stacks would mean two test setups, and components such as the quick-save playlist picker would be written twice.
- The only argument for a split is weight. Today's content script injects **88 KB gzip of JS and 10 KB gzip of CSS into every YouTube page**, mostly to render a toaster **[measured]**. If the performance budget (still open in the map) rules that out, Svelte everywhere (option 3), or a framework-free in-page bundle, is a cleaner fix than mixing frameworks.

## Comparison

Ratings run ++ (best) / + / ~ / − / −−. The JS and render columns are from the benchmark **[measured]**: the same popup-like page built with each stack. Sources for every other cell are in the sections below.

| Stack | Polish | A11y | JS gzip (CSS) · first render 1× / 4× CPU | Theming | Shadow root | CSP · WXT | `bun test` + happy-dom | Health, Oct 2026 | Hand-styling left |
|---|---|---|---|---|---|---|---|---|---|
| **shadcn on Base UI** | + (8 shadcn styles) | + WAI-ARIA, screen-reader tested | 121 KB · 87 / 322 ms | ++ CSS variables, `.dark` | ++ ShadowRoot portals, composedPath | ++ CSPProvider; Toast injects nothing · module-react | ++ works with no setup | ++ monthly, MUI team, 10.7M/wk | Popup low; in-page: YouTube skin |
| **shadcn on React Aria** | + (same 8 styles) | ++ widest AT matrix, i18n | 109 KB · 101 / 366 ms | ++ same | ~ experimental flag, one root | ~ writes `<style>` to page head · module-react | + works; some happy-dom bugs | ++ monthly, Adobe, 2.8M/wk | Same as above |
| **Svelte 5 + shadcn-svelte / Bits UI** | + (shadcn port) | + claims WAI-ARIA | **61 KB** · **56 / 191 ms** | ++ same model | + `defaultPortalTo`; nested-root regression open | + styles land in the shadow root · module-svelte | ~ needs a plugin + conditions flag | + frequent releases, one main maintainer, 805k/wk | Same as above |
| shadcn on Radix | + | + | 111 KB · 86 / 311 ms | ++ | − focus/dismiss use `document`; old bugs open | ~ `react-remove-scroll` styles the page head | + (untested here) | ~ 10-month gap in 2025–26, one maintainer | Same as above |
| Mantine 9 | ++ own design | + | 126 KB (+35 KB CSS) · 105 / 417 ms | + needs the root element set inside the shadow | + official WXT example, fixes keep landing | + nonce support | ~ docs target jsdom | ~ weekly releases, one maintainer | Popup none; in-page: override Mantine |
| HeroUI v3 | ++ own design | ++ (React Aria) | 132 KB (+39 KB CSS) · 134 / 524 ms | + `dark:` doesn't cross the shadow root | − WXT click bug closed "not planned" (v2) | ~ inherits React Aria's head styles | ~ | + company-backed, v3 since Mar 2026 | Same as Mantine |
| Chakra v3 | ++ own design | ~ | 177 KB · 193 / 730 ms | ~ Emotion at runtime | − several open shadow bugs | − Emotion `<style>` at runtime | ~ | ~ | Same as Mantine |
| Ark UI / Park UI | ~ (Park dormant) | + | 117 KB · 89 / 320 ms | + | ~ "not designed" for multiple roots | + | + its own tests run on happy-dom | ~ v6 breaking changes coming | High |
| Radix Themes | + | + | 119 KB (+79 KB CSS) · 117 / 403 ms | ~ tokens on `:root` only | − | ~ | ~ | − one release in 20 months | Same as Mantine |
| Headless UI / Catalyst | + (Catalyst is paid) | + | 109 KB · 89 / 338 ms | + | ~ | + | ~ | − patch releases only since 2024 | High; no slider or toast |
| Solid + Kobalte | ~ | + | **45 KB** · 65 / 242 ms | + | ~ open Select bug | ~ `innerHTML` with no Trusted Types policy | ~ needs a Babel plugin | − Solid 2 / Kobalte 2 migration coming | High |
| Vue + shadcn-vue / Reka | + | + | 76 KB · 71 / 256 ms | + | ~ "full support" still open | + | ~ | + | Same as above |

The React rows include React's own runtime: 66 KB gzip and 49 / 164 ms with no library at all. Svelte with no library is 13 KB and 22 / 105 ms; Solid with no library is 5 KB and 20 / 91 ms **[measured]**.

## Benchmark

**The page:** each stack renders the same popup-like page: a header, 30 checkbox rows, 4 switches, a slider, a text field, a popover, a dialog and a toast trigger with its toaster. Toasts use the stack's own toast, or Sonner for Base UI, Radix, Headless UI and Radix Themes, matching what shadcn shipped until July 2026. Each page was built separately with Vite 8.3.4 in production mode.

**What "first render" means:** the time from navigation start to the first frame after the app's mount hook ran (a `requestAnimationFrame` followed by a `setTimeout`). It was measured in headless Chrome for Testing 156.0.8078.4, loading from a localhost HTTP server, with a fresh context per run.
- **Runs:** median of 15 runs at 1× CPU and 10 runs at 4× CPU throttling, on a Ryzen 5 5600X under WSL2.
- **Not popup open time:** browser popup window creation isn't included. The README's ~60 ms is a different measurement, so treat the gaps between rows as the signal, not the absolute values.
- **Noise:** each framework schedules its mount hook slightly differently, so differences of one frame (~16 ms) are noise.

| Build | JS min | JS gzip | CSS gzip | First render 1× | First render 4× |
|---|---|---|---|---|---|
| React 19.3.1, no library | 214.6 KB | 66.2 KB | – | 49 ms | 164 ms |
| + Base UI 1.9.0 + Sonner 2.0.8 | 384.8 KB | 120.7 KB | – | 87 ms | 322 ms |
| + Radix (`radix-ui` 1.8.1) + Sonner | 387.1 KB | 110.8 KB | – | 86 ms | 311 ms |
| + React Aria Components 1.22.1 | 356.4 KB | 108.9 KB | – | 101 ms | 366 ms |
| + Headless UI 2.2.10 + Sonner (no slider) | 352.4 KB | 109.4 KB | – | 89 ms | 338 ms |
| + Ark UI 5.39.3 | 380.8 KB | 116.7 KB | – | 89 ms | 320 ms |
| + Mantine 9.7.3 (full `styles.css`) | 413.6 KB | 126.2 KB | 35.0 KB | 105 ms | 417 ms |
| + HeroUI 3.2.6 (all component styles) | 433.6 KB | 132.4 KB | 38.5 KB | 134 ms | 524 ms |
| + Radix Themes 3.3.0 + Sonner | 422.2 KB | 118.9 KB | 78.6 KB | 117 ms | 403 ms |
| + Chakra 3.37.0 (Emotion) | 627.8 KB | 177.1 KB | runtime | 193 ms | 730 ms |
| Svelte 5.57.2, no library | 33.9 KB | 13.2 KB | – | 22 ms | 105 ms |
| + Bits UI 2.19.5 + svelte-sonner 1.2.1 | 199.0 KB | 60.5 KB | 2.9 KB | 56 ms | 191 ms |
| Solid 1.9.17, no library | 11.6 KB | 4.6 KB | – | 20 ms | 91 ms |
| + Kobalte 0.13.14 + solid-sonner 0.3.2 | 143.5 KB | 44.6 KB | – | 65 ms | 242 ms |
| Vue 3.5.44 + Reka UI 2.11.0 + vue-sonner 2.0.9 | 226.9 KB | 75.7 KB | – | 71 ms | 256 ms |
| Preact 11.0.1, no library | 13.1 KB | 5.5 KB | – | 36 ms | 109 ms |

**Today's 1.5.0 build** **[measured]**, from `wxt build` on Chrome MV3 at `301ae51`:
- **Popup:** 118.7 KB gzip of JS (374 KB minified). That is the popup chunk 18.7 KB, the shared React/Base UI chunk 70.4 KB, and the SettingsPanel chunk 29.6 KB. `popup.html` modulepreloads SettingsPanel, so it is fetched even though it's lazy-loaded. Plus 7.5 KB gzip of CSS.
- **Content script:** 88.0 KB gzip of JS (284 KB minified) and 10.1 KB gzip of CSS, injected on every YouTube page.

**Other measurements of the same libraries:**
- Per component, esbuild with React external: Base UI costs 1.7–1.9× Radix. Dialog is 23.4 vs 13.9 KB gzip, Popover 40.2 vs 24.3, Menu 60.2 vs 31.5 **[measured]**.
- Whole-package sizes are not useful because everything here tree-shakes. For example, Bundlephobia gives `react-aria-components@1.22.1` as 279 KB gzip whole ([bundlephobia](https://bundlephobia.com/api/size?package=react-aria-components@1.22.1)).
- Runtime-only sizes from bundlejs: react + react-dom/client 69 KB, vue 25.8 KB, preact 4.6 KB, solid-js/web 4.5 KB ([bundlejs](https://deno.bundlejs.com/)).

## What every candidate must cope with on YouTube

These constraints come from the platform, not from any one library. They shape what "works in a shadow root" means below.

### WXT's shadow root

- **What `createShadowRootUi` does** ([source](https://github.com/wxt-dev/wxt/blob/main/packages/wxt/src/utils/content-script-ui/shadow-root.ts), confirmed in the installed 0.21.4 `dist`):
  - It opens an **open** shadow root.
  - It prepends `:host{all:initial !important;}` unless `inheritStyles` is set.
  - With `cssInjectionMode: "ui"`, it loads the entry's CSS and rewrites `:root` to `:host`.
  - It moves every `@property` and `@font-face` block into a `<style>` in the **page's** `<head>`. Browsers ignore those rules inside shadow roots ([split-shadow-root-css.ts](https://github.com/wxt-dev/wxt/blob/main/packages/wxt/src/utils/split-shadow-root-css.ts)).
- **No `<html>`/`<head>`/`<body>` inside the shadow root any more:** `@webext-core/isolated-element` 2.0 replaced the inner `<html>` with a `<div>` ([changelog](https://github.com/aklinker1/webext-core/blob/main/packages/isolated-element/CHANGELOG.md), [PR #128](https://github.com/aklinker1/webext-core/pull/128)).
  - The WXT FAQ's `shadow.querySelector('body')` portal snippet is stale ([FAQ](https://wxt.dev/guide/resources/faq)).
  - Portal into `uiContainer` or the `ShadowRoot`.
- **WXT maintenance:** effectively one maintainer, aklinker1, with 1,270 commits; the next contributor has 42 ([contributors](https://api.github.com/repos/wxt-dev/wxt/contributors)). The last release was 0.21.4 on 2026-08-11 ([releases](https://api.github.com/repos/wxt-dev/wxt/releases)). The map keeps WXT; this is a risk worth knowing, not a reason to change.

### Tailwind v4 in a shadow root

- **`@property` is ignored inside shadow roots** in every engine ([tailwindcss#15005](https://github.com/tailwindlabs/tailwindcss/issues/15005), open; [shadow-dom-css tracker](https://shadow-dom-css.adobe.com/features/at-property/)).
  - Tailwind 4.1's fallback only targets old Safari and Firefox ([PR #17435](https://github.com/tailwindlabs/tailwindcss/pull/17435)).
  - WXT's hoisting into the page head is what makes shadows, rings and transforms work today.
  - Hoisted `--tw-*` registrations are global, so they can clash with another extension's Tailwind version on the same page ([wxt#1955](https://github.com/wxt-dev/wxt/issues/1955), open). YouTube itself defines no `--tw-` variables **[measured]**.
- **`rem` is YouTube's, not ours.** YouTube serves `<html style="font-size: 62.5%;font-family: Roboto, Arial, sans-serif;" …>` **[measured]** (fetched www.youtube.com, build `5d669aa8`).
  - So 1 rem is 10 px, and every rem-based Tailwind utility or library size renders at 62.5% of what was intended.
  - WXT's docs warn about this ([content scripts guide](https://wxt.dev/guide/essentials/content-scripts)) and suggest `postcss-rem-to-responsive-pixel` ([FAQ](https://wxt.dev/guide/resources/faq)). Mantine instead offers `theme.scale` ([docs](https://mantine.dev/styles/rem/)).
  - This hits every candidate equally. The in-page skin needs either a px-based `@theme` or a rem-to-px step.

### YouTube's look

- **Colour tokens:** YouTube no longer uses `--yt-spec-*`. Its main stylesheet (`kevlar_base`, 3.2 MB) defines 207 `--yt-sys-color-baseline--*` tokens on `[light],html` and `[dark],html[dark]` and has no `var(--yt-spec-…)` uses **[measured]**. Examples:
  - `base-background`: `#fff` / `#0f0f0f`
  - `raised-background`: `#fff` / `#212121`
  - `menu-background`: `#fff` / `#282828`
  - `call-to-action`: `#065fd4` / `#3ea6ff`
  - `static-brand-red`: `#f03`
- **Inheritance:** custom properties inherit through the flat tree into shadow roots ([CSS Scoping](https://drafts.csswg.org/css-shadow-1/)), and `all: initial` leaves custom properties alone ([MDN `all`](https://developer.mozilla.org/en-US/docs/Web/CSS/all)). So `color: var(--yt-sys-color-baseline--text-primary)` inside WXT's shadow root follows YouTube's light and dark modes with no theme code at all.
  - These are undocumented internals; Return YouTube Dislike still references the old `--yt-spec-*` names ([content-style.css](https://github.com/Anarios/return-youtube-dislike/blob/main/Extensions/combined/content-style.css)). So the skin needs fallbacks, and the tokens belong in the breakage inventory.
- **Type:** the page loads Roboto and YouTube Sans from Google Fonts, and `font-family:"YouTube Sans",Roboto,sans-serif` appears 215 times in its CSS **[measured]**.
  - `@font-face` names declared in the document can be used inside shadow trees ([CSS Scoping §4.2](https://drafts.csswg.org/css-shadow-1/)). Because `all: initial` resets `font-family`, the skin must set it explicitly.
  - Licensing for bundling YouTube Sans is **UNVERIFIED**; referencing the font the page already loaded avoids the question.
- **Consequence:** the in-page look comes from the skin, not from the library. That's why "polish out of the box" only matters for the popup and settings.

### Keyboard, YouTube hotkeys and `isolateEvents`

- **How YouTube filters key events.** YouTube's `ignoreKeyEvent` (desktop JS build `5d669aa8`, minified, so it may change) skips key events in four cases **[measured]**:
  - Ctrl or Alt is held (except with the arrow keys).
  - The event's `composedPath()` contains an `INPUT`, `SELECT`, `TEXTAREA`, `EMBED`, `YTD-COMMENTBOX` or similar.
  - The event is `defaultPrevented`.
  - Space lands on a button, link or `role=button|option|menuitem` while the keyboard is in use (it treats this as a click).
- **What that means for our UI:**
  - Text fields and keys the primitives already `preventDefault` are safe.
  - Plain letter keys on non-input widgets can still trigger player shortcuts, such as typeahead in a playlist menu.
- **`isolateEvents: true`** stops `keydown`, `keyup` and `keypress` at the shadow root ([isolated-element source](https://github.com/aklinker1/webext-core/blob/main/packages/isolated-element/src/index.ts)).
  - Reading the source suggested this would break Escape-to-close, because Base UI listens on the document.
  - In a happy-dom spike, Base UI and React Aria popovers inside a shadow root **still closed on Escape** with a stop-propagation listener on the root (the listener fired) **[measured]**.
  - Confirm on real YouTube during the in-page prototype.

### Fullscreen

- **The problem:** when the player is fullscreen, only the fullscreen element's subtree and the top layer render. A toast or popover in a shadow host on `<body>` is then invisible.
  - React Aria has this as [#10506](https://github.com/adobe/react-spectrum/issues/10506); the workaround is a portal container of `document.fullscreenElement`.
  - The same applies to every library (inference from [MDN: top layer](https://developer.mozilla.org/en-US/docs/Glossary/Top_layer)).
- **Why it matters:** auto-add fires while the user is watching, so toasts in fullscreen are a real case.
- **Base UI:** its `Toast.Portal` `container` accepts any element ([docs](https://base-ui.com/react/components/toast)), so the container can follow `fullscreenchange`.

### CSP and Trusted Types

- **Extension pages:**
  - Chrome's MV3 default CSP is `script-src 'self'; object-src 'self';` ([Chrome](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)). Firefox's is `script-src 'self'; upgrade-insecure-requests;` ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_Security_Policy)).
  - Neither restricts `style-src`, and no candidate uses `eval` (Base UI, React Aria and HeroUI dists were grepped).
- **YouTube's headers:** YouTube sends no `style-src`, but it does send `require-trusted-types-for 'script'` **[measured]** (`curl -sI` of `/` and `/watch`).
  - Isolated-world content scripts are exempt: "Content script isolated worlds are not affected by Trusted Types headers set by the web page" ([W3C Trusted Types wiki](https://github.com/w3c/trusted-types/wiki/Effects-of-deploying-Trusted-Types-on-browser-extension-developers)).
  - Chrome bypasses the check for any isolated world with its own CSP ([trusted_types_util.cc](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/core/trustedtypes/trusted_types_util.cc)).
  - Firefox exempts content scripts since 140 and 145 ([bug 1947732](https://bugzilla.mozilla.org/show_bug.cgi?id=1947732), [bug 1986632](https://bugzilla.mozilla.org/show_bug.cgi?id=1986632)).
  - So Svelte, Solid and Vue, which build DOM from `innerHTML` templates, are fine in the content script. They would break only in MAIN-world code such as the queue bridge, which has no UI.
- **Firefox and content-script `<style>`:** page CSP does not apply to inline `<style>` added by content scripts ([bug 1415352](https://bugzilla.mozilla.org/show_bug.cgi?id=1415352), fixed in 59).

### What happy-dom can't test

All read from the happy-dom 21.0.3 source ([repo](https://github.com/capricorn86/happy-dom/tree/master/packages/happy-dom/src)):

- **Layout:** `getBoundingClientRect` returns an empty rect, so every Floating UI position is 0.
- **Resizing:** `ResizeObserver` does nothing.
- **CSS:** `@layer` and `@property` are dropped, so `getComputedStyle` can't see Tailwind v4 utilities.
- **Dialogs and popovers:** `showModal()` only sets `open`.
- **Focus:** `delegatesFocus` is ignored because of a typo in `attachShadow`.

So `bun test` + happy-dom can check behaviour and ARIA, but not looks or positioning.

**A pass in happy-dom doesn't prove real-browser shadow-DOM behaviour.** React Aria's Button failed to click inside a real shadow root without its flag ([#10051](https://github.com/adobe/react-spectrum/issues/10051)), yet the same kind of test passed in happy-dom **[measured]**.

## Shortlisted

### 1. shadcn/ui on Base UI (React)

**shadcn**
- shadcn now offers three bases: Base UI (the default since July 2026), Radix ("not being deprecated… You do not need to migrate") and React Aria. All three work with eight styles: Vega, Nova, Maia, Lyra, Mira, Luma, Rhea and Sera ([Base UI default](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default), [React Aria](https://ui.shadcn.com/docs/changelog/2026-07-react-aria), [changelog](https://ui.shadcn.com/docs/changelog)).
- This repo uses `base-nova`.
- Shadcn is built at Vercel ([docs](https://ui.shadcn.com/docs/official)). The CLI ships constantly: 64 stable releases in 12 months, latest 4.22.1 on 2026-10-18 ([npm](https://registry.npmjs.org/shadcn)).

**Toasts**
- On Base UI, shadcn's Toast replaced Sonner in July 2026 ("built on Base UI primitives"). `/docs/components/base/sonner` now redirects (308) to `/toast` ([changelog](https://ui.shadcn.com/docs/changelog/2026-07-toast)) **[measured]**.
- Sonner 2.0.8 always appends its CSS to `document.head` when imported, with no option to change it **[measured]** in `dist/index.mjs`. Today's code has to import `sonner/dist/styles.css` into the shadow root by hand.

**Shadow root**
- Portal `container` accepts `HTMLElement | ShadowRoot | RefObject | null` ([Dialog API](https://base-ui.com/react/components/dialog)). There is no app-wide default container, but with shadcn you own the wrapper components, so a context can supply it.
- The internals are shadow-aware ([shadowDom.ts](https://raw.githubusercontent.com/mui/base-ui/master/packages/utils/src/shadowDom.ts)):
  - `getTarget()` uses `composedPath()[0]`.
  - `activeElement()` descends into `shadowRoot.activeElement`.
  - `contains()` crosses shadow hosts.
- Fixed and shipped: ShadowRoot containers ([#2236](https://github.com/mui/base-ui/pull/2236)), outside-press dismissal ([#4230](https://github.com/mui/base-ui/issues/4230), [#4333](https://github.com/mui/base-ui/pull/4333)), Combobox, Menu and Slider ([#3198](https://github.com/mui/base-ui/issues/3198), [#3603](https://github.com/mui/base-ui/issues/3603), [#3953](https://github.com/mui/base-ui/issues/3953)), and nested dialogs in closed roots ([#5650](https://github.com/mui/base-ui/issues/5650)).
- [#5990](https://github.com/mui/base-ui/pull/5990) was merged after 1.9.0 and isn't released yet.
- Only [#2867](https://github.com/mui/base-ui/issues/2867) is open, and it reproduces only inside the CodeSandbox iframe.

**CSP**
- `CSPProvider` takes `nonce` and `disableStyleElements` ([docs](https://base-ui.com/react/utils/csp-provider)).
- Only `ScrollArea.Viewport` and `Select` with `alignItemWithTrigger` render a `<style>`. React 19 hoists such styles into the shadow root, not the page: react-dom 19.3.1's `getHoistableRoot` returns `container.getRootNode()` when that is a ShadowRoot (nodeType 11) **[measured]**.

**Accessibility**
- The docs say components "adhere to WAI-ARIA design patterns and are tested on a wide range of platforms, devices, browsers, screen readers" ([about](https://base-ui.com/react/overview/about), [accessibility](https://base-ui.com/react/overview/accessibility)).

**Testing**
- This repo's popup tests already drive Base UI controls with Testing Library on happy-dom (under Vitest today; `vitest.config.ts` sets `environment: "happy-dom"`).
- Under `bun test` 1.4.3 with `@happy-dom/global-registrator`, the following passed with no plugins **[measured]**:
  - Checkbox, Switch and Dialog flows.
  - A Popover portalled into a shadow root that opens on click and closes on Escape.

**Health**
- 1.0.0 shipped on 2025-12-11. Since then there has been a minor release every month, 1.1 through 1.9, with 1.9.0 on 2026-10-09 ([releases](https://api.github.com/repos/mui/base-ui/releases?per_page=30)).
- About 10.7M downloads a week ([npm](https://api.npmjs.org/downloads/point/last-week/@base-ui/react)).
- Maintained by MUI's team, including the Floating UI author ([InfoQ](https://infoq.com/news/2026/02/baseui-v1-accessible/); team list in the package's bundled `docs/react/overview/about.md`).

**Polish and hand-styling**
- Same as today: shadcn's styled, copied-in components for the popup and settings.
- More registries add to this:
  - [coss ui](https://coss.com/ui), formerly Origin UI, is now Cal.com's design system "built on Base UI from the ground up". It's mixed MIT/AGPL, so check each folder's licence ([README](https://raw.githubusercontent.com/cosscom/ui/main/README.md)).
  - Animate UI and ReUI ship Base UI variants (**UNVERIFIED**, secondary sources only).

### 2. shadcn/ui on React Aria (React)

**Setup**
- `shadcn init --base aria` works with all eight styles. "Existing projects keep their current base", so switching means re-initialising ([changelog](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)).
- Other React Aria + Tailwind v4 registries:
  - [Intent UI](https://intentui.com/docs/getting-started/installation), active.
  - [Untitled UI React](https://www.untitledui.com/react): free components are MIT; PRO is paid and starts at $349 ([license](https://www.untitledui.com/license)).
  - JollyUI is stale (last push January 2025).

**Accessibility**
- Tested with VoiceOver (macOS and iOS), JAWS and NVDA, and TalkBack. Strings are localised for 30+ languages, with right-to-left support, and hover isn't applied on touch ([quality](https://react-aria.adobe.com/quality)).
- No other candidate documents a testing matrix this wide.

**Shadow root**
- The support is behind `enableShadowDOM()` and off by default ([flags.mjs](https://cdn.jsdelivr.net/npm/react-stately@3.51.0/dist/private/flags/flags.mjs)).
- A maintainer, May 2026: "it is still considered experimental hence why we didn't call it out in the docs" ([#10051](https://github.com/adobe/react-spectrum/issues/10051)).
- The [RFC](https://github.com/adobe/react-spectrum/blob/main/rfcs/2025-shadow-dom-support.md) scopes it to "one assumed Shadow root that the entire application lives in". WXT's single root fits that.
- Portals go through `UNSAFE_PortalProvider` ([docs](https://react-aria.adobe.com/PortalProvider)).
- Open items: [PR #10631](https://github.com/adobe/react-spectrum/pull/10631) (keyboard ComboBox across roots), [#10581](https://github.com/adobe/react-spectrum/issues/10581) (`ariaHideOutside` uses the global document) and [#10506](https://github.com/adobe/react-spectrum/issues/10506) (fullscreen).

**CSP and the page head**
- `usePress` adds a `<style id="react-aria-pressable-style">` to `ownerDocument.head`, and `usePreventScroll` adds one to `document.head` ([usePress](https://cdn.jsdelivr.net/npm/react-aria@3.53.1/dist/private/interactions/usePress.mjs), [usePreventScroll](https://cdn.jsdelivr.net/npm/react-aria@3.53.1/dist/private/overlays/usePreventScroll.mjs)).
- On YouTube those land in YouTube's `<head>`, and the `touch-action` rule never reaches our shadow content (my inference).

**Testing**
- Passed under `bun test` with no plugins: Checkbox, plus a Popover opened and closed inside a shadow root **[measured]**.
- Known happy-dom bugs, both open: DateInput overflows the call stack ([react-spectrum#7652](https://github.com/adobe/react-spectrum/issues/7652)), and Toolbar's ArrowLeft is broken ([happy-dom#2152](https://github.com/capricorn86/happy-dom/issues/2152)).

**Health**
- A minor release roughly every month in 2026; 1.22.1 came out on 2026-10-09 ([releases](https://react-aria.adobe.com/releases/v1-22-0)).
- 2.8M downloads a week ([npm](https://api.npmjs.org/downloads/point/last-week/react-aria-components)). Maintained by Adobe.

**Bundle and speed**
- Less JS than Base UI in the benchmark (109 vs 121 KB gzip), but a slower first render (101 / 366 vs 87 / 322 ms) **[measured]**.
- `@react-aria/optimize-locales-plugin` strips unused locale strings ([getting started](https://react-aria.adobe.com/getting-started)).

### 3. Svelte 5 + shadcn-svelte / Bits UI

**Size and speed**
- 60.5 KB gzip and 56 / 191 ms, against 120.7 KB and 87 / 322 ms for Base UI **[measured]**.
- Svelte's own runtime is 13 KB.
- Most of the gap is React's runtime (66 KB). The rest is the primitives: about 47 KB for Bits UI against about 55 KB for Base UI with Sonner.

**shadcn-svelte**
- Version 1.7.0, Svelte 5 and Tailwind v4 ([migration](https://www.shadcn-svelte.com/docs/migration/tailwind-v4)).
- It keeps up with shadcn's newer styles (Luma, Sera, Rhea) and has a `create` builder and a Sonner component ([changelog](https://www.shadcn-svelte.com/docs/changelog)).

**Shadow root**
- `Portal` `to` takes `Element | string`. "The default target can be modified using the `defaultPortalTo` prop of the BitsConfig component" for a whole subtree ([portal docs](https://bits-ui.com/docs/utilities/portal)). So one line points everything at WXT's container.
- General shadow-DOM support landed in [PR #1515](https://github.com/huntabyte/bits-ui/pull/1515) (May 2025).
- A FocusScope fix in 2.19.5 ([#2180](https://github.com/huntabyte/bits-ui/pull/2180)) caused an open regression: focusing an input in a *nested* shadow root counts as leaving the trap ([#2203](https://github.com/huntabyte/bits-ui/issues/2203)). One flat root, as WXT gives us, shouldn't hit it (inference).
- Svelte appends component CSS to the shadow root when there is one ([css.js](https://cdn.jsdelivr.net/npm/svelte@5.57.2/src/internal/client/dom/css.js)), so svelte-sonner's styles land in the right place.

**Trusted Types**
- Svelte 5.51+ wraps its template `innerHTML` in a `svelte-trusted-html` policy ([reconciler.js](https://cdn.jsdelivr.net/npm/svelte@5.57.2/src/internal/client/dom/reconciler.js)). It isn't needed in isolated worlds anyway (see above).

**WXT**
- `@wxt-dev/module-svelte` 2.0.5, published 2026-03-19 ([npm](https://registry.npmjs.org/@wxt-dev/module-svelte)). The `createShadowRootUi` docs include a Svelte `mount()` example ([guide](https://wxt.dev/guide/essentials/content-scripts)).

**Testing**
- Bun's only official Svelte guide is written for Svelte 4 ([guide](https://bun.com/docs/guides/test/svelte-test)).
- In the spike, three things had to be added **[measured]**:
  - a Bun plugin that runs `svelte/compiler`'s `compile` on `.svelte` files;
  - `compileModule` on `.svelte.js/.ts` files, because Bits UI ships rune modules;
  - `bun test --conditions browser`, because without it Svelte resolves its server build and `mount()` throws.
- With those in place, a Bits UI Checkbox and a Popover portalled into a shadow root passed with `@testing-library/svelte` 5.4.2.

**Health**
- Bits UI 2.19.5 (2026-10-03): 33 stable releases in 12 months, with a gap between May and August 2026 ([npm](https://registry.npmjs.org/bits-ui)).
- Built and maintained by Hunter Johnston ([intro](https://bits-ui.com/docs/introduction)).
- About 805k downloads a week, against 10.7M for Base UI.

**Accessibility**
- Claims WAI-ARIA compliance, keyboard navigation, focus management and screen-reader support ([intro](https://bits-ui.com/docs/introduction)). No published testing matrix.

**Cost**
- 2.0 is a ground-up rebuild, so there's no migration as such.
- But the team's React and Base UI knowledge, the existing tests and patterns, and React's ecosystem (Testing Library, lucide-react and so on) don't carry over.
- Bun runs React's JSX natively; Svelte always needs a compile step.

## Not shortlisted

### shadcn on Radix

- **Bundle:** lighter than Base UI per component (see [Benchmark](#benchmark)).
- **Shadow DOM:** its primitives still assume the document.
  - `FocusScope` reads `document.activeElement`, and `DismissableLayer` checks `event.target` on `ownerDocument` rather than `composedPath()` ([focus-scope.tsx](https://raw.githubusercontent.com/radix-ui/primitives/main/packages/react/focus-scope/src/focus-scope.tsx)).
  - Shadow bugs open for years: [#1772](https://github.com/radix-ui/primitives/issues/1772) (Dialog/Menu accessibility in shadow DOM, since 2022), [#3353](https://github.com/radix-ui/primitives/issues/3353) and [#2606](https://github.com/radix-ui/primitives/issues/2606).
  - The Dialog's scroll lock injects a `<style>` into `document.head` via `react-style-singleton`, which means YouTube's head.
- **Health:** no stable `radix-ui` release between 1.4.3 (2025-08-13) and 1.5.0 (2026-06-06) ([npm](https://registry.npmjs.org/radix-ui)). 76 of the last 100 commits are by one person ([commits](https://api.github.com/repos/radix-ui/primitives/commits)).

### Mantine 9

- **For:** the most polished all-in-one kit.
  - No runtime CSS-in-JS since v7 ([changelog](https://mantine.dev/changelog/7-0-0/)).
  - An official WXT example inside a shadow root ([wxt-dev/examples](https://raw.githubusercontent.com/wxt-dev/examples/main/examples/react-mantine/entrypoints/content.tsx)).
  - Steady shadow-DOM fixes, for example `useClickOutside` moving to `composedPath()` in 9.1 ([changelog](https://mantine.dev/changelog/9-1-0/)).
- **Against:**
  - Heavier and slower (126 KB JS + 35 KB CSS, 105 / 417 ms) **[measured]**.
  - Its own design language, so the in-page UI would fight it.
  - Dark mode keys off `data-mantine-color-scheme` on a root element that has to be inside the shadow root ([MantineProvider](https://mantine.dev/theming/mantine-provider/)).
  - It sits beside Tailwind rather than on it ([help](https://help.mantine.dev/q/third-party-styles)).
  - One maintainer: 14,036 commits against 64 for the next contributor ([contributors](https://api.github.com/repos/mantinedev/mantine/contributors)).
- **Verdict:** pick it only if hand-styling the popup feels too costly.

### HeroUI v3

- **What it is:** stable since 2026-03-21, built on React Aria and Tailwind v4, with no framer-motion ([npm](https://registry.npmjs.org/@heroui/react), [animation docs](https://heroui.com/docs/react/getting-started/animation)).
- **Against:**
  - The slowest Tailwind-based stack in the benchmark (134 / 524 ms) **[measured]**.
  - In v2, `onPress` didn't fire inside WXT's `createShadowRootUi`; the issue was closed "not planned" ([#5295](https://github.com/heroui-inc/heroui/issues/5295)).
  - v3.2.5 fixed tokens under `:host`, but `dark:` and `--z-index-overlay` still don't cross the boundary ([PR #6841](https://github.com/heroui-inc/heroui/pull/6841)).
  - The licence changed to Apache-2.0 in the repo while npm still says MIT ([v3.0.3 notes](https://heroui.com/docs/react/releases/v3-0-3)).

### Chakra UI v3

- **Emotion at runtime:** Chakra deliberately kept it ([v3 announcement](https://chakra-ui.com/blog/announcing-v3)), which means `<style>` injection, a cache container per shadow root ([shadow DOM guide](https://chakra-ui.com/docs/get-started/environments/shadow-dom)), and the heaviest, slowest result in the benchmark (177 KB, 193 / 730 ms) **[measured]**.
- **Shadow DOM:** bugs got no fix:
  - Toast in shadow DOM throws ([#9823](https://github.com/chakra-ui/chakra-ui/issues/9823)).
  - Dialogs close when the window regains focus ([#10224](https://github.com/chakra-ui/chakra-ui/issues/10224)).
  - Layout breaks on 62.5% root font sizes in an extension ([#10008](https://github.com/chakra-ui/chakra-ui/issues/10008)).

### Ark UI / Park UI

- **Ark:** headless, built on Zag, and its own tests run on happy-dom.
  - A maintainer says "The components are not designed to work across multiple root nodes" ([#3411](https://github.com/chakra-ui/ark/issues/3411)).
  - v6 changes data attributes and replaces `asChild` ([#3616](https://github.com/chakra-ui/ark/issues/3616)).
- **Park UI:** the styled layer is close to dormant, with its last commit on 2026-02-21 ([repo](https://api.github.com/repos/chakra-ui/park-ui)).

### Radix Themes

- One npm release in 20 months: 3.2.1 (2025-02) → 3.3.0 (2026-01-31) ([npm](https://registry.npmjs.org/@radix-ui/themes)).
- Its CSS is 79 KB gzip, with tokens on `:root, .light, .light-theme` and not one `:host` selector **[measured]** (`@radix-ui/themes` 3.3.0 `styles.css`). WXT's `:root`→`:host` rewrite would cover only some of it.

### Headless UI / Catalyst

- Headless UI has had patch releases only since 2.2.0 (October 2024); 2.2.10 came out on 2026-04-07 ([npm](https://registry.npmjs.org/@headlessui/react)).
- It has no Slider and no Toast.
- Catalyst is a paid Tailwind Plus download ([docs](https://catalyst.tailwindui.com/docs)); its price and licence are **UNVERIFIED** because the pages need a login.

### React Spectrum 2

- It is Adobe's own design system.
- "colors and internal padding cannot be customized within Spectrum components" ([styling](https://react-spectrum.adobe.com/styling)).
- Fonts load from Adobe Typekit.

### Solid + Kobalte

- **For:** the smallest stack (45 KB) **[measured]**.
- **Against:**
  - Kobalte is still 0.13.x. Its 2.0 alpha requires Solid 2.0 RC, and Solid 2.0 is at `rc.15` ([Kobalte npm](https://registry.npmjs.org/@kobalte/core), [solid-js npm](https://registry.npmjs.org/solid-js)). Picking it now means picking a migration.
  - Select doesn't work with `useShadow` ([#444](https://github.com/kobaltedev/kobalte/issues/444), open since 2024).
  - `bun test` needs a Babel plugin ([Bun PR #41699](https://github.com/oven-sh/bun/pull/41699)); the spike passed with one **[measured]**.

### Vue + shadcn-vue / Reka UI

- Healthy, but "Full Shadow DOM support" is still an open issue ([reka-ui#2725](https://github.com/unovue/reka-ui/issues/2725)).
- It is slower and heavier than Svelte with no offsetting gain **[measured]**.

### Preact

- Base UI merged "Restore Preact support" ([#2086](https://github.com/mui/base-ui/pull/2086)) and fixed Preact bugs in February 2026 ([#3975](https://github.com/mui/base-ui/pull/3975)), but a crash under `preact/compat` is still open ([#4670](https://github.com/mui/base-ui/issues/4670)).
- The README's "Preact does not work" gotcha may now be only partly true (**UNVERIFIED**; not retried).
- No polished Preact-native kit exists. If weight is the goal, Svelte gives more.

## Questions this raises

1. **Performance budget.** Not yet specified in the map.
   - The popup and the content script need separate budgets: today the content script costs every YouTube page 88 KB gzip of JS and 10 KB gzip of CSS.
   - The answer decides between option 1 or 2 and option 3, and whether one stack is enough.
2. **In-page theme source.** Should in-page UI follow YouTube's `html[dark]` through `--yt-sys-color-baseline--*`, ignoring the extension's theme setting?
   - That matches "look like YouTube" and fixes the "toasts follow the OS theme" defect.
   - It leans on undocumented tokens, which belong in the breakage inventory (ticket 18).
3. **rem handling in-page.** Convert to px with a px `@theme` or `postcss-rem-to-responsive-pixel`, or size in rem like YouTube does so the UI follows the user's font size?
4. **Toasts in fullscreen.** Auto-add happens while watching. Do toasts follow the player into fullscreen (re-parent into `document.fullscreenElement`), or wait until it ends? This belongs to ticket 14.
5. **Keyboard isolation in-page.** Set `isolateEvents`, or rely on `preventDefault` and real inputs? Typeahead in a playlist menu can trigger player hotkeys. Verify on real YouTube in the in-page prototype.
6. **Toast component.** Base UI Toast, as shadcn now ships it, or keep Sonner? Sonner writes into YouTube's head, and "toasts with undo" needs an action button either way.
7. **Visual testing layer.** happy-dom can't see Tailwind v4 styles or positions. Does the in-page UI need a real-browser test layer (Playwright) beside `bun test`? This overlaps ticket 04.
8. **Tailwind `@property` hoisting.** WXT writes Tailwind's `@property` rules into YouTube's `<head>`, where they can clash with other extensions ([wxt#1955](https://github.com/wxt-dev/wxt/issues/1955)). Accept that, or keep the in-page skin off utilities that need `@property` (shadows, rings, transforms)?

## Notes against the map

- **No conflict with a settled decision.** "Inside YouTube, look like YouTube" is easiest to meet with headless primitives plus a skin built on YouTube's own tokens, which is what option 1 already is.
- **Refinement:** YouTube's tokens are `--yt-sys-color-baseline--*`, not the `--yt-spec-*` names older extensions use.
- **`bun test`:** this favours React slightly. React components need no Bun plugin; Svelte and Solid need a custom loader and `--conditions browser`.
- **README drift:**
  - WXT's shadow root no longer has `<html>/<body>` (README and WXT docs).
  - "Preact does not work" is partly stale.
  - The popup still modulepreloads the SettingsPanel chunk although it's lazy-loaded.

## Method

- **Benchmark:**
  - Separate Vite 8.3.4 projects for React (`@vitejs/plugin-react` 6.1.2), Svelte (`@sveltejs/vite-plugin-svelte` 7.3.1), Solid (`vite-plugin-solid` 2.11.14), Vue (`@vitejs/plugin-vue` 6.0.10) and Preact, built with default production settings.
  - Sizes are the sum of emitted `.js` and `.css` files, gzip level 9.
  - Timing used Playwright-core 1.64.1 driving `chrome-headless-shell` 156.
  - The scratch projects lived in `/tmp` and are not committed. They can be rebuilt from the versions and component lists above.
- **Today's build:** `wxt build` of this repo at `301ae51` (WXT 0.21.4, Vite 8.3.4) in a scratch copy.
- **`bun test` spike:**
  - Bun 1.4.3, happy-dom 21.0.3 through `@happy-dom/global-registrator`, Testing Library (React 16.3.3, Svelte 5.4.2, Solid 0.8.10) and user-event 14.6.7.
  - React needed nothing. Svelte needed a plugin (`compile` and `compileModule`) plus `--conditions browser`. Solid needed a plugin running `babel-preset-solid` plus `--conditions browser`.
  - All tests passed, including portals into a shadow root and Escape with key events stopped at the root.
- **YouTube facts:**
  - Fetched on 2026-10-19 with a desktop Chrome user agent, logged out: the home page HTML, response headers for `/` and `/watch`, the `kevlar_base` stylesheet, and the `kevlar_base` JS bundle (build `5d669aa8`).
  - Logged-in pages may differ (**UNVERIFIED**).
- **Release and adoption figures:** from `registry.npmjs.org` (`time` field: stable versions in the last 12 months) and `api.npmjs.org/downloads/point/last-week` for 2026-10-10 to 2026-10-16.
