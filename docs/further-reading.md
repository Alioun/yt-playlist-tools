# Further reading

[← Docs](README.md)

External docs that the [research notes](rebuild/research.md) and the [2.0 spec](../.scratch/rebuild/spec.md) lean on, grouped by topic.

## Building the extension

- [WXT](https://wxt.dev/): the extension framework, in 1.5.0 and 2.0
  - [Content scripts](https://wxt.dev/guide/essentials/content-scripts) · [Unit testing](https://wxt.dev/guide/essentials/unit-testing.html) · [Publishing](https://wxt.dev/guide/essentials/publishing.html) · [`wxt submit`](https://wxt.dev/api/cli/wxt-submit)
- [Bun](https://bun.com/docs/installation): the runtime and package manager

## UI

- [Svelte 5](https://svelte.dev/docs/svelte/overview): 2.0's UI framework ([ADR-0002](adr/0002-svelte-and-bits-ui.md))
- [shadcn-svelte](https://www.shadcn-svelte.com/docs) and its [changelog](https://www.shadcn-svelte.com/docs/changelog)
- [Bits UI](https://bits-ui.com/docs/introduction): the headless primitives under shadcn-svelte, including [Portal](https://bits-ui.com/docs/utilities/portal) for shadow roots
- [`@wxt-dev/module-svelte`](https://www.npmjs.com/package/@wxt-dev/module-svelte): Svelte in WXT
- 1.5.0's stack: [shadcn/ui](https://ui.shadcn.com/) on [Base UI](https://base-ui.com/)

## Testing

- [`bun test` configuration](https://bun.com/docs/test/configuration) · [Mocks](https://bun.com/docs/test/mocks) · [DOM testing](https://bun.com/docs/test/dom) · [Coverage](https://bun.com/docs/test/code-coverage) · [`bunfig.toml`](https://bun.com/docs/runtime/bunfig)
- [happy-dom's Global Registrator](https://github.com/capricorn86/happy-dom/wiki/Global-Registrator): a DOM for `bun test`
- [WXT's fake browser](https://webext-core.aklinker1.io/fake-browser/implemented-apis): which `browser.*` APIs it fakes
- [Playwright](https://playwright.dev/) and [Puppeteer](https://pptr.dev/): 2.0's real-browser test layer

## Firefox and Firefox Add-ons

- [Permission request messages for Firefox extensions](https://support.mozilla.org/en-US/kb/permission-request-messages-firefox-extensions) (Mozilla Support)
- [Extension data collection](https://support.mozilla.org/en-US/kb/extension-data-collection) (Mozilla Support)
- [Firefox built-in data collection consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) (Extension Workshop)
- [Add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) and [source code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/) (Extension Workshop)
- [Content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) (MDN)

## Chrome and the Chrome Web Store

- [Permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings) and the [permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)
- [Program policies](https://developer.chrome.com/docs/webstore/program-policies/policies)
- [User data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq) and [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Privacy practices tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)

## YouTube's internal API

- [YouTube.js (youtubei.js)](https://github.com/LuanRT/YouTube.js): a JavaScript client for InnerTube
- [yt-dlp's YouTube extractor](https://github.com/yt-dlp/yt-dlp/tree/master/yt_dlp/extractor/youtube)
- [NewPipeExtractor](https://github.com/TeamNewPipe/NewPipeExtractor) and [Invidious](https://github.com/iv-org/invidious)
- [Multiselect for YouTube](https://addons.mozilla.org/en-US/firefox/addon/multiselect-for-youtube/): a listed Firefox add-on that edits playlists through the user's session, as 2.0 will
- [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies): why there is no Data API fallback ([ADR-0001](adr/0001-youtube-access-through-the-users-session.md))

## YouTube Music

- [ytmusicapi](https://github.com/sigma67/ytmusicapi): a Python client for YouTube Music's internal API
- [Pear Desktop](https://github.com/pear-devs/pear-desktop): an Electron wrapper of the YouTube Music web app, whose plugins add to the app's own queue
