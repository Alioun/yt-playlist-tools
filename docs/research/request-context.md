# Where 2.0 can send YouTube's internal requests from

Research for rebuild ticket 02 (`.scratch/rebuild/issues/02-request-context.md`). The question: from which context can an MV3 extension on desktop Chrome and Firefox send YouTube's internal InnerTube (`/youtubei/v1/…`) requests through the user's signed-in session, and with which permissions?

Every source was read on **2026-10-19**. Bracketed IDs such as [C4] point to the [Sources](#sources) list.

Each claim is marked one of four ways:
- **Docs:** a primary source states it.
- **Code:** derived from reading browser source or tests; not run in a browser.
- **Probe:** measured with curl on 2026-10-19. The scripts are in `docs/research/request-context/`. Probes are signed out, so they show YouTube's Origin gate, not cookie auth.
- **Unverified:** needs a live check in a real, signed-in browser. These are collected in [section 8](#8-live-checks-still-needed).

The request reasoned about is a typical authenticated InnerTube write: `POST https://www.youtube.com/youtubei/v1/browse/edit_playlist` with the user's cookies, `Authorization: SAPISIDHASH …`, `X-Origin: https://www.youtube.com`, `X-Goog-AuthUser`, and the client name and version (section 1). Ticket 01 catalogues the actual requests.

## Answer

**YouTube rejects extension origins.** Any InnerTube POST whose `Origin` is `chrome-extension://…` or `moz-extension://…` gets HTTP 403. Adding `X-Origin: https://www.youtube.com` doesn't help. A request with YouTube's own Origin, or with no Origin at all, gets 200 (Probe, [Y4]). Everything else follows from this:
- **Requests sent from a youtube.com document pass.** That covers the MAIN world, the isolated content script, and a youtube.com frame. They carry YouTube's own Origin, the tab's cookies and the tab's container.
- **Requests from the extension's origin are rejected unless the Origin header is rewritten.** That covers the background, the popup and settings pages, and an offscreen document's own fetch. They also have to read the SAPISID cookie through the `cookies` API to build the `Authorization` header.

### Recommended place per scenario

| Scenario | Recommended | Why |
|---|---|---|
| **A YouTube tab is open** (auto-add, shortcuts, queue and quick-save buttons, card menu) | **That tab's MAIN world**: a manifest `world: "MAIN"` content script, called by the isolated content script over a small event bridge. | The request is indistinguishable from YouTube's own: same Origin, Referer and cookies, and it follows the tab's container, private window and signed-in account. The MAIN world is also the only place YouTube's own client code is reachable: `ytcfg`, its `SAPISIDHASH` code, `resolveCommand`. Ticket 03 asks for that client to do the authenticating [Y6]. |
| **The popup or settings page is open and some YouTube tab exists** (active or not) | **Route the request through a YouTube tab**: the active tab if it is YouTube, otherwise another open one. | Same identity as above, and no extra permission is needed. The background can track live YouTube tabs from content-script hello messages, so `tabs` isn't required. Which tab to pick when tabs use different accounts or containers is for ticket 11. |
| **No YouTube tab at all** | **Show cached data, and offer to open YouTube for actions.** In parallel, spike a hidden youtube.com frame (below). Use the background path only if ticket 03's rules are reopened. | See the trade-offs in the next table. |

### The options for "no YouTube tab"

| Option | Works? | Conflicts with settled decisions? |
|---|---|---|
| **Background, popup or settings fetch** with `credentials: "include"` | Only with two additions:<br>1. The Origin rewritten to `https://www.youtube.com`, by a declarativeNetRequest (DNR) session rule (Chrome 101+, Firefox 113+) or, on Chrome 149+, by setting `Origin` in `fetch()` itself.<br>2. SAPISID read through the `cookies` API.<br><br>Cookies are attached and treated as same-site on both browsers (Docs, Code). It uses only the default cookie store: no container-tab session, and no incognito or private session. | **Yes.** Ticket 03 ruled out cookie reading and Origin or Referer rewriting [Y6]. |
| **Hidden youtube.com frame** inside an offscreen document (Chrome, reason `IFRAME_SCRIPTING`) or inside the event page (Firefox). The same content scripts run in the frame. | **Unproven; needs a spike.**<br>- Normal youtube.com pages send `X-Frame-Options: SAMEORIGIN`, and neither browser exempts extensions. `/embed/<id>` and `/robots.txt` send none (Probe).<br>- In the frame, requests carry YouTube's real Origin and, per the docs and code, first-party cookies.<br>- Still needs the `SAPISIDHASH`, unless the embed page's own client can do the work. | Only if our code computes `SAPISIDHASH` from `document.cookie`. No headers are rewritten. |
| **Open a YouTube tab in the background** | Works. | Intrusive and visible. Rejected. |

### Permission set

For the recommended tab-first design:
- **`storage`.**
- **A content script on `https://www.youtube.com/*`** (isolated and MAIN world). On both browsers, content-script matches count as host access [C17, F16]. An explicit identical `host_permissions` entry adds no new warning.
- **Chrome only, if the hidden-frame spike succeeds:** `offscreen`. It has no warning.
- **Drop** `identity`, `activeTab`, `scripting` and the googleapis hosts.
- **Not needed:** `cookies`, `tabs`, `declarativeNetRequest*`, `webRequest`.

What users see:
- **Chrome install prompt:** only "Read and change your data on www.youtube.com" [C18].
- **Firefox install prompt:** one host line. Code reading gives "Access your data for sites in www.youtube.com domains" (unverified rendering) [F17].
- **Firefox update from 1.4.5:** no update prompt (Docs, Code [F16, F21]).
  - Firefox MV3 neither prompts for nor grants new origins on update.
  - Anyone who installed 1.4.5 on Firefox 125–126, or later revoked access, may lack the youtube.com grant.
  - 2.0 must therefore check `permissions.contains()` and ask with `permissions.request()` from a click.
  - The same check covers Chrome users who set site access to "on click".
- **If the background path is ever chosen:** add `cookies` and `declarativeNetRequestWithHostAccess`. Neither shows a prompt line on either browser [C17, F17]. Chrome Web Store disclosures grow, though: "Authentication information" [Y6].

### Minimum versions

- **Chrome 111.**
  - Manifest `content_scripts[].world` needs 111 [C16].
  - Everything else is older: offscreen needs 109, DNR `initiatorDomains` needs 101.
  - Current Stable is **155.0.8059.85** [C22].
- **Firefox 128**, up from today's 125. MAIN-world content scripts need 128 [F5].
  - 129 also hides MAIN-world script file names from page-readable stack traces [F6].
  - Current release is **Firefox 158**, released 2026-10-13 [F18].
- **Firefox ESR in October 2026: ESR 153** (153.0 on 2026-07-21; 153.5.0 on 2026-10-13).
  - **ESR 140 has reached end of life.** Its last release was 140.17.0 on 2026-09-29.
  - ESR 115 lives on only for Windows 7–8.1 and macOS 10.12–10.14, until March 2027. Those users can't run MAIN-world scripts and will stay on 1.4.5 [F18].
  - Any floor from 128 to 153 drops no user on a supported mainstream ESR.

## 1. What an authenticated InnerTube request carries

**YouTube's own web client** (bundle `kevlar_base`, client version 2.20261016.01.00) [Y3]:
- **`Authorization`.**
  - It hashes the page's own origin with `SAPISID`, falling back to `__Secure-3PAPISID` if that's missing.
  - It also adds `SAPISID1PHASH` (from `__Secure-1PAPISID`) and `SAPISID3PHASH` (from `__Secure-3PAPISID`).
  - Each hash carries a `_u` suffix when `USER_SESSION_ID` is set.
- **Other headers:** `X-Goog-AuthUser` (session index), `X-Origin: window.location.origin`, and `X-Goog-PageId` (`DELEGATED_SESSION_ID`, for brand accounts).
- **Common headers:** `X-Goog-Visitor-Id`, `X-Youtube-Bootstrap-Logged-In`, `X-Youtube-Client-Name` and `X-Youtube-Client-Version`.
- **How the fetch is made:**
  - Same-origin, `credentials: "same-origin"`.
  - The browser adds `Origin`, `Referer` and cookies.
  - There is no `key=` query parameter.
- **Where the values live:** in `ytcfg`, a page-world global [Y3].

**yt-dlp** builds the same three hashes over `"<USER_SESSION_ID> <ts> <SAPISID> https://www.youtube.com"`. It sends `Origin` and `X-Origin` set to the same value, plus `X-Goog-AuthUser`, `X-Goog-PageId`, the visitor ID and the client headers. It sends no API key by default [Y1].

**YouTube.js** hashes only `SAPISID` with `https://www.youtube.com`. On servers it sends `Origin` but no `X-Origin` [Y2].

**What YouTube checks** (Probe, [Y4]):
- **The `Origin` header** decides between 200 and 403. Present and foreign (an extension, or `https://evil.example`): 403. Absent, or a YouTube or Google origin: 200.
- **`X-Origin` doesn't decide it.** `X-Origin` set to an extension URL with no `Origin` still gets 200.
- **The check doesn't depend on auth.** A `browse/edit_playlist` write with a fake SAPISID and a matching hash still gets 403 with an extension Origin. With a YouTube Origin it gets 200 and a response marked `logged_in: 0` [Y4].
- **Unverified:** whether the hash is validated against `X-Origin` or `Origin`. The signed-out probes can't tell.

**`SAPISID` is readable from page JavaScript.** YouTube's own bundle reads it through its cookie getter [Y3], and a page script can only do that if the cookie isn't HttpOnly. A conflicting anecdote says SAPISID sometimes disappears, so the bundle's fallback to `__Secure-3PAPISID` matters (unverified while signed in).

## 2. Context by context

### 2.1 MAIN world in a YouTube tab

There are two ways to put code in the page world:
- **A manifest `world: "MAIN"` content script.** Chrome 111+ [C16]; Firefox 128+ [F5].
- **Today's injected `<script src=…>`.** It needs `web_accessible_resources` [W2]. On Firefox that exposes the per-instance `moz-extension://<uuid>` to the page [F1].

| Question | Finding |
|---|---|
| **Session** | It is the page's own `fetch` with the page's principal, so the request is identical to YouTube's own (Docs [C3]; Code [F3]). Cookies come from the tab's jar: its container on Firefox [F3], and its incognito or private window if the extension is allowed there. It is first-party, so SameSite and Total Cookie Protection don't interfere. |
| **Origin / Referer** | `Origin: https://www.youtube.com` and the page URL as Referer. No rewriting is needed. |
| **Page rules apply** | Chrome: "When a content script is injected into the main world, the CSP of the page applies" [C3]. YouTube's CSP has no `connect-src`, so same-origin `fetch` is allowed. `require-trusted-types-for 'script'` affects DOM sinks, not `fetch` (Probe [Y4]). The page "can detect and interfere with the executed code" [F1]. |
| **YouTube's client** | `ytcfg`, YouTube's own auth code and `resolveCommand` are reachable only here [Y3]. Whether YouTube's client can send every needed request for us is ticket 01's question. |
| **No YouTube tab** | Doesn't exist. |
| **Lifetime** | The document's lifetime. It survives YouTube's in-app navigation and ends on reload or tab close. A discarded or frozen background tab can't answer (unverified for routing). |
| **Permissions** | Host access to youtube.com through the content-script match. Manifest scripts need no `scripting` permission. |
| **Versions** | Chrome 111 (manifest), 95 (`executeScript` world), 102 (`registerContentScripts` world) [C15, C16]. Firefox 128 for all three [F5]. |

**It has no extension APIs** [W1]. It talks to the isolated script through `CustomEvent`s or `postMessage`.
- Firefox still needs `cloneInto` for object payloads sent to the page (`.scratch/rebuild/inventory.md`, "Messaging"). JSON strings avoid it.
- **WXT:** `defineContentScript({ world: "MAIN" })` is supported since 0.12, and its `main()` gets no `ctx` [W2]. WXT emits `world` with no browser-version check [W2].
- WXT's docs still recommend `injectScript`, for MV2 and cross-browser reach [W1]. The docs' "Chromium only" note was removed on 2026-10-04, in an unreleased change [W3].

### 2.2 Isolated-world content script

| Question | Finding |
|---|---|
| **Session** | **Chrome (85+):** content-script requests "are subject to the same request rules as the page they are running within" [C1]. They are sent "on behalf of the web origin that the content script has been injected into" [C2]. **Firefox MV3 (101+):** `fetch` and XHR "happen in context of the page"; `content.fetch` no longer exists [F1, F2]. The script uses the page's principal [F3] and keeps the tab's container [F3]. Cookies from the tab are attached (Code). |
| **Origin / Referer** | **Chrome:** `Origin` on a POST is the page origin (Code [C7, C8]). **Firefox:** a same-origin PUT carries the page origin in Mozilla's test [F4]. POST is inferred to match (unverified). Referer is the page URL (unverified). |
| **`ytcfg` and cookies** | `window.ytcfg` isn't visible. The values would have to come from the MAIN world, or from a regex over the inline `ytcfg.set({…})` script text [Y3]. `document.cookie` is readable on both browsers (non-HttpOnly only) [C3, F3]. A hand-built `SAPISIDHASH` here is "cookie reading". |
| **No YouTube tab** | Doesn't exist. |
| **Lifetime** | As for the MAIN world. |
| **Permissions** | The content-script match. |
| **Versions** | Any MV3 version. |

**Verdict:** the network identity is the same as the MAIN world. Its advantage is direct access to extension APIs. Its drawback is no access to YouTube's client. Keep it as the orchestrator and the bridge to the extension, and let the MAIN world send the requests.

### 2.3 Background and extension pages

This covers the Chrome service worker, the Firefox event page, and the popup and options pages. Extension pages share the background's origin and network identity (Code [C7]).

**Session (Chrome):**
- **Cookies are attached.** Host access disables CORS for the extension, and cookies flow even with the default credentials mode (Code [C7]).
- **Requests count as same-site.** "Requests from an extension to a third-party are treated as same-site if the extension has host permissions for the third-party. This means SameSite=Strict cookies can be sent." [C5]. The SameSite FAQ dates this to Chrome 79 [C4].
- **Content-script matches count as host access.** "Effective hosts" include them, while hosts the user has withheld are excluded (Code [C7]).
- **Docs and code disagree on blocked third-party cookies.** The docs add that the same-site treatment "does not apply if third-party cookies are blocked" [C5]. The code exempts the extension scheme from third-party-cookie blocking [C24]. Unverified.
- **Third-party cookies aren't going away.** Chrome keeps user choice for third-party cookies and isn't deprecating them [C21].
- **Incognito:** in the default "spanning" mode, the service worker runs in the regular profile [C19], so it never sees an incognito session.

**Session (Firefox):**
- **Cookies are attached.** An add-on principal may load any URL it has host permission for (Code [F7]).
- **SameSite doesn't block them.** "Do not treat loads triggered by web extensions as foreign", fixed in Firefox 77 [F7].
- **Total Cookie Protection doesn't partition them.** It is the default since Firefox 103 [F8]. Extension requests to permitted hosts aren't third-party, and get no partition key (Code [F8]). So the background sees the user's normal youtube.com cookies (Code; unverified live).
- **Containers:** the background can't send requests as a container. Bug 1670278, "Enable extensions to send network requests … with a specific cookieStoreId", is still NEW [F9].
- **Private browsing:** Firefox has no split incognito mode [F10], so the background never uses private-window cookies.

**Origin and Referer (Chrome):**
- **What it sends:** a POST carries `Origin: chrome-extension://<id>`, set by Chromium's own test (Code [C8]). No Referer is sent (Code [C7], unverified). `Sec-Fetch-Site: none` (Code [C7]).
- **Fix 1, a DNR rule** (Chrome 86+ for `modifyHeaders`):
  - It can `set` `Origin` and `Referer`. DNR has no header blocklist, and its matched requests take the `extraHeaders` path (Code [C10, C11]).
  - Rules do match the extension's own service-worker and page fetches. `initiatorDomains: [chrome.runtime.id]` (101+) scopes a rule to them (Code [C10]; Docs [C9]).
  - It "can't change the request origin or initiator" for CORS or cookie decisions [C11], which doesn't matter here.
- **Fix 2, setting `Origin` in `fetch()` on Chrome 149+:**
  - Chromium's `kBypassRequestForbiddenHeadersCheck` lets "chromium extensions with appropriate host permissions … override this header in fetch requests initiated from background pages or extension service workers. It does not apply to requests initiated from content scripts" [C6].
  - The flag is disabled at 148.0.7778.218 and enabled by default from 149.0.7827.201 to `main` (Code [C6]).
  - It is **undocumented** in Chrome's extension docs: "What's new" through Chrome 153 has no entry. The spec change is still an open WHATWG issue [C23]. Google could switch it off remotely (unverified).

**Origin and Referer (Firefox):**
- **What it sends:** `Origin: moz-extension://<uuid>`, which Mozilla's test shows on PUT [F4]. Bug 1405971, "Webextension UUID leak to servers via Fetch request headers", is still NEW [F19].
- **`fetch()` can't set `Origin`** [F3].
- **Fix 1, a DNR rule** (Firefox 113+, MV2 and MV3) [F13]:
  - Only the `Host` header is policed when headers are modified.
  - Requests from an extension are matched against that extension's own rules only (Code [F13]).
  - The initiator of a background request is its `moz-extension://<uuid>` URL, so `initiatorDomains: [<uuid>]` should scope a rule (Code [F13], unverified).
  - Mozilla's own modifyHeaders tests fetch from the background page [F14].
- **Fix 2, blocking `webRequest`.** It is still supported in Firefox MV3 [F20].

**No YouTube tab:** this context works without one. That is its only advantage.

**Lifetime:**
- **Chrome service worker** [C14]. It is terminated:
  - "after 30 seconds of inactivity" (events and extension API calls reset the timer);
  - when one event takes over 5 minutes;
  - "when a fetch() response takes more than 30 seconds to arrive".
- **Firefox event page:**
  - It is suspended after `extensions.background.idle.timeout` = 30 s. Extension API calls and delivered events reset the timer (Code [F15]).
  - Ports don't keep it alive (bug 2081340, NEW) [F15].
  - A pending `fetch` doesn't either (Code; unverified).
- **What this means:** single InnerTube calls are sub-second, so this matters only for long batches.
- **Popup and settings pages** live while open. A popup that closes mid-request aborts it, so writes should go through the background.

**Permissions:**
- Host access to www.youtube.com.
- `cookies`, to read SAPISID.
- `declarativeNetRequestWithHostAccess`, or Chrome 149+ only.
- Firefox: `webRequest` + `webRequestBlocking` are an alternative to DNR.

**Versions:** Chrome 101 with DNR, or 149 without. Firefox 113.

**Verdict:** technically viable on both browsers, as listed precedents show [Y5, Y6]. But it is the path ticket 03 excluded, and it is blind to container, incognito and private sessions.

### 2.4 Offscreen document (Chrome) and hidden youtube.com frames

**The offscreen document's own fetch** gains nothing:
- It is an extension page, so its fetches have the same identity as the service worker's (Code [C12]).
- "The runtime API is the only extensions API supported by offscreen documents" [C12].
- No offscreen reason covers making network requests [C12].

**The useful case is a youtube.com frame inside it.**

**Offscreen documents (Chrome)** [C12, C13]:
- Chrome 109+.
- The `IFRAME_SCRIPTING` reason fits: "embed and script an iframe".
- No lifetime limit except for `AUDIO_PLAYBACK`.
- Only one at a time.
- No permission warning [C17].

**Firefox has no offscreen API.** Bug 1807830 was closed WONTFIX: "Firefox supports Event Pages in MV3, which already provide access to DOM APIs" [F11]. The frame can live in the event page itself, and dies when the page is suspended [F15].

**Framing:**
- `www.youtube.com/`, `/live_chat`, `/sw.js` and error pages send `X-Frame-Options: SAMEORIGIN`. `/embed/<id>` and `/robots.txt` send none. No URL sends `frame-ancestors` (Probe, `frame-headers.sh`).
- **Chrome** enforces XFO for frames under extension pages; `ancestor_throttle.cc` has no extension exemption (Code [C20]).
- **Firefox** briefly exempted extensions, then reverted that in 77 [F12].
- So normal pages need XFO stripped with a DNR response-header rule. That is security-header circumvention, which falls under ticket 03's rule. A frameable URL avoids it.

**Session in the frame:**
- **Chrome:**
  - "Third-party cookies are never blocked even in subframes if the top-level page for a given tab is a chrome-extension:// page."
  - With host permission, the framed site gets "access to its top-level partition" (Chrome 115+) [C5].
  - The same page also says an embedded site "will use the extension origin as the partition key". The code limits that to partitioned (CHIPS) cookies (Code [C20], unverified).
  - The frame's own same-origin fetches get the extension's same-site treatment (Code [C7]).
  - `document.cookie` in the frame may not get it (Code [C7]; unverified).
- **Firefox:** "iframes in Firefox's extension documents do not use partitioned storage" [F8].

**Origin:** requests from the frame are ordinary `https://www.youtube.com` requests. No rewriting is needed.

**Content scripts in such frames** need `all_frames: true`. Whether each browser injects into frames under extension pages is unverified.

**Verdict:** this is the only no-tab path that needs no header rewriting. It is unproven, though:
- frameable pages and cookies;
- content-script injection;
- whether `ytcfg` or a working client exists in `/embed/`;
- whether YouTube's embed client can do the work, or our code must compute `SAPISIDHASH` from `document.cookie`.

It also costs a frame load per wake-up. Worth one spike before ticket 10 decides.

## 3. Side-by-side

| | MAIN world (tab) | Isolated (tab) | Background, popup, settings | Offscreen fetch | Hidden youtube.com frame |
|---|---|---|---|---|---|
| **Origin sent** | youtube.com | youtube.com | extension → **403** | extension → **403** | youtube.com |
| **Fix needed** | none | none | DNR `set Origin`, or Chrome 149+ `fetch` | same | none if the URL is frameable, else strip XFO |
| **Cookies** | the tab's | the tab's | default store, same-site | default store | first-party, per docs and code |
| **Containers, private windows** | follows the tab | follows the tab | default only | default only | default only |
| **`SAPISIDHASH`** | YouTube's client or `document.cookie` | `document.cookie` | `cookies` API | `cookies` API | `document.cookie` or the embed client |
| **`ytcfg`** | yes | no (regex) | must be fetched or cached | same | `/embed/` has its own (unverified) |
| **No YouTube tab** | no | no | yes | yes | yes |
| **Lifetime** | document | document | 30 s idle (both browsers) | until closed | the host page's |
| **Extra permissions** | none | none | `cookies`, `declarativeNetRequestWithHostAccess` | + `offscreen` | `offscreen` (Chrome) |
| **Minimum version** | Chrome 111, Firefox 128 | any | Chrome 101 or 149, Firefox 113 | Chrome 109 | Chrome 109, Firefox any |

## 4. Permissions and what the prompts show

**Chrome** [C17, C18]:

| Permission | Install warning |
|---|---|
| `https://www.youtube.com/*` (host or content-script match) | "Read and change your data on www.youtube.com" |
| `*://*.youtube.com/*` | "Read and change your data on all youtube.com sites" |
| `cookies`, `scripting`, `offscreen`, `storage`, `activeTab`, `declarativeNetRequestWithHostAccess` | none |
| `declarativeNetRequest` | "Block content on any page" |
| `tabs` | "Read your browsing history" |

- **Content-script matches produce host warnings too.** "Adding or changing match patterns in the "host_permissions" and "content_scripts.matches" fields of the manifest file will also trigger a warning" [C17].
- **Adding a host that's already matched is not an increase.** Hosts are compared by host, not scheme (Code [C18]).
- **New warnings on update.** "When a new permission that triggers a warning is added, the extension will be disabled until the user accepts the new permission" [C17]. 2.0 is a first Chrome listing, so this applies only to later versions.

**Firefox** [F16, F17, F21]:

| Permission | Install prompt line |
|---|---|
| host `www.youtube.com` | "Access your data for www.youtube.com" (string `one-site`). Since 133 the dialogs pass `fullDomainsList`, which renders a single host as "Access your data for sites in www.youtube.com domains" (Code; exact text unverified) |
| `*.youtube.com` | "…sites in the youtube.com domain" (`wildcard`), or "…in youtube.com domains" under `fullDomainsList` |
| `tabs` | "Access browser tabs" |
| `declarativeNetRequest` | "Block content on any page" |
| `cookies`, `scripting`, `activeTab`, `webRequest`, `webRequestBlocking` | none (`OptionalPermissionNoPrompt`) |
| `storage`, `declarativeNetRequestWithHostAccess` | none |

**Firefox MV3 host access at install:**
- "From Firefox 127, host permissions listed in `host_permissions` and `content_scripts` are displayed in the install prompt", and they are granted at install (bug 1889402) [F16].
- "If an extension update requests new host permissions, these are not shown to the user" (bug 1893232, still NEW) [F16]. Origins are left out of the update diff and aren't granted (Code [F21]).
- Users can revoke host access at any time [F16].

**Firefox update prompts** are shown only for new API permissions that have a prompt line. None of the recommended set has one, so 1.4.5 → 2.0 updates silently (Code [F21]).

**1.4.5 on AMO:**
- It is MV3, with a content script on `*://*.youtube.com/*`, no `host_permissions`, and `strict_min_version` 125 (`git show e96dbf7:manifest.json`).
- Installs made on Firefox 127+ were granted the origin. Installs on 125–126 weren't, unless the user granted it.
- So 2.0 needs a runtime check and a click-to-grant path in the popup or onboarding.

**Choice of host pattern:** `https://www.youtube.com/*` is the narrowest, and enough for every recommended context.
- m.youtube.com is out of scope, and music.youtube.com is excluded today.
- `*://*.youtube.com/*` would only matter if a background fetch were redirected to another youtube.com host, such as the EU `consent.youtube.com` page for signed-out visitors. One early probe saw that redirect; a re-run didn't reproduce it (unverified).

## 5. Versions and the release calendar

**Chrome** [C14, C15, C16, C22]:

| Feature | Chrome |
|---|---|
| `scripting.executeScript({world: "MAIN"})` | 95 |
| `registerContentScripts` with `world` | 102 |
| manifest `content_scripts[].world` | **111**: absent at 110.0.5481.177, present at 111.0.5563.64 |
| offscreen | 109 |
| DNR `modifyHeaders` | 86 |
| `declarativeNetRequestWithHostAccess` | 96 |
| DNR `initiatorDomains` | 101 |
| service-worker idle rules settled | 110 |
| `Origin` settable in `fetch` from SW and background pages | 149 |

Current Stable: **155.0.8059.85** [C22].

**Firefox** [F5, F6, F13, F15, F16, F18]:

| Feature | Firefox |
|---|---|
| MV3 generally available, with event pages | 109 |
| DNR | 113 |
| host permissions granted at install | 127 |
| MAIN world (manifest, `executeScript`, `registerContentScripts`) | **128** |
| MAIN-world file names redacted | 129 |

**Firefox release calendar** [F18]:
- **Current release:** 158, released 2026-10-13.
- **ESR 153:** released 2026-07-21; 153.5.0 came out on 2026-10-13. It hands over to ESR 175 (due 2027-06-29) and reaches end of life in September 2027.
- **ESR 140:** final release 140.17.0 on 2026-09-29, so it is end of life.
- **ESR 115:** extended only for Windows 7–8.1 and macOS 10.12–10.14, until March 2027.

**WXT:** latest 0.21.4 (2026-08-11) [W4]. In MV3 it emits `background.scripts` (an event page) for Firefox and `service_worker` for Chrome [W2]. Two gaps:
- **No offscreen entrypoint:** use an unlisted page plus a manual permission [W4].
- **No DNR helpers:** session rules need no manifest entry. Static rule files would go in `public/`. The `declarative_net_request` manifest type is an open issue [W4].

## 6. Conflicts with settled decisions

1. **Ticket 03 rules out the only proven no-tab path.**
   - The map records "No cookie reading" for ticket 03. Ticket 03's note says "Never rewrite Origin or Referer to make requests pass" [Y6].
   - A background, popup, settings or offscreen request needs both:
     - Without the Origin fix, YouTube answers 403 (Probe).
     - Without SAPISID it can't build `Authorization`, and only the `cookies` API can read SAPISID there.
   - Chrome 149's settable `Origin` is still rewriting the Origin.
   - So, under the settled rules, 2.0 can't send requests while no YouTube tab is open unless the hidden-frame spike succeeds.
2. **"No cookie reading" holds in the tab only if YouTube's own client can do every request.**
   - The alternative is that InnerTube accepts a same-origin, cookie-only request with no `Authorization` header (unverified).
   - If neither holds, the MAIN world must read SAPISID from `document.cookie` to build the hash. The listed precedent Multiselect for YouTube™ does exactly that [Y6].
   - Ticket 03's actual wording is "where possible" [Y6]. The map's shorthand "No cookie reading" reads stricter than that.
3. **The map's "Firefox needs 128+" is confirmed.** Raising `strict_min_version` from 125 to 128 strands ESR 115 legacy-OS users on 1.4.5. It also lets the injected bridge become a manifest MAIN-world script, as the inventory anticipated.

## 7. New questions and decisions

- **Spike, hidden youtube.com frame.** In an offscreen document (Chrome) and in the event page (Firefox):
  - Do `/embed/<id>` or `/robots.txt` load?
  - Do content scripts inject into the frame?
  - Are signed-in cookies, SAPISID and `ytcfg` present?
  - Does an `edit_playlist` from the frame succeed?
- **Ticket 10.** Choose the no-tab behaviour:
  - cached data plus "Open YouTube";
  - the frame, if the spike passes;
  - or reopen ticket 03 for the background path (`cookies` plus DNR `set Origin`).
- **Ticket 10 or 11.** When several YouTube tabs are open with different accounts or containers, which one does the popup use? And what does the popup show when the active tab's account differs from the cached setup's?
- **Ticket 01 / spike.** Is `Authorization` needed at all for same-origin, cookie-carrying InnerTube calls? Can YouTube's own client send each needed request (reads included) without driving the visible UI?
- **Onboarding.** Detect a missing or withheld youtube.com grant (Firefox MV3 updates, Firefox 125–126 installs, Chrome "on click"), and ask for it from a click.
- **Private windows and incognito.** Should 2.0 run there at all? Ticket 03 says not to persist records from private windows [Y6].
- **Version floors.** Chrome 111 or higher; Firefox 128, 140 or 153.
- **Discarded or frozen tabs.** How do they affect routing through a background YouTube tab?

## 8. Live checks still needed

Run these in real Chrome (Stable) and Firefox (release and ESR 153), signed in. Include a second account, a brand account, and a Firefox container tab.

1. From the MAIN world and from the isolated content script, an `edit_playlist` POST:
   - its `Origin`, `Referer` and `Sec-Fetch-Site`;
   - that it succeeds;
   - that in a container tab it acts on the container's account.
   - Firefox isolated-world POST Origin is inferred only.
2. Is `SAPISID` (or `__Secure-3PAPISID`) readable through `document.cookie` while signed in, and with what SameSite attribute?
3. Does a same-origin, cookie-only request with no `Authorization` header get a signed-in response, or succeed as a write?
4. Is the hash checked against `X-Origin` or `Origin`? Mismatch each one in turn.
5. Background fetch:
   - **Chrome:** does a DNR `set Origin` rule scoped by `initiatorDomains: [runtime.id]` make it pass? Does Chrome 149+'s `fetch` `Origin` really go out? Are Lax and Strict cookies sent with "Block third-party cookies" on? Is it ignored when site access is "on click"?
   - **Firefox:** are cookies sent under Total Cookie Protection? Does `initiatorDomains: [<uuid>]` match? Does an event page with an in-flight fetch get suspended?
6. Hidden frame: everything in the spike above, plus whether YouTube frame-busts inside an extension page.
7. The exact Firefox install-prompt text for the chosen host pattern, and confirmation that the 1.4.5 → 2.0 update shows no prompt.
8. What `world: "MAIN"` does on Firefox 125–127. This only matters if the floor stays below 128.

## Sources

**Chrome and Chromium.** Source paths are under https://chromium.googlesource.com/chromium/src/+/main/ unless a tag is given.
- [C1] Chromium Security, "Changes to Cross-Origin Requests in Chrome Extension Content Scripts". https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/ ("content scripts will be subject to the same request rules as the page they are running within"; "launched in Chrome 85").
- [C2] Chrome docs, Cross-origin network requests. https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- [C3] Chrome docs, Content scripts (isolated worlds; "When a content script is injected into the main world, the CSP of the page applies"). https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- [C4] Chromium SameSite FAQ ("treat extension-initiated requests as same-site … available in Chrome 79", "if the extension has host permissions"). https://www.chromium.org/updates/same-site/faq/
- [C5] Chrome docs, Storage and cookies. https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
- [C6] `services/network/public/cpp/features.h` (comment on `kBypassRequestForbiddenHeadersCheck`) and `features.cc`. Compared at tags `148.0.7778.218` (`FEATURE_DISABLED_BY_DEFAULT`) and `149.0.7827.201` (`FEATURE_ENABLED_BY_DEFAULT`), and on `main`.
- [C7] Chromium network and extension source:
  - `services/network/cors/cors_url_loader.cc` (`ShouldIncludeOriginHeader`)
  - `services/network/url_loader_util.cc` (`ShouldForceIgnoreSiteForCookies`, `IsSameOriginOrAccessAllowed`)
  - `services/network/sec_header_helpers.cc` (non-webby initiators send `Sec-Fetch-Site: none`)
  - `extensions/browser/url_loader_factory_manager.cc`
  - `extensions/common/cors_util.cc` and `permission_set.cc` (`InitEffectiveHosts`)
  - `services/network/cookie_settings.cc`
- [C8] `chrome/browser/extensions/fetch_apitest.cc` (`OriginOnPostWithPermissions`, `ExtensionFetchHeadersTest`).
- [C9] Chrome docs, chrome.declarativeNetRequest. https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- [C10] DNR source:
  - `extensions/browser/api/declarative_net_request/ruleset_manager.cc` (`ShouldEvaluateRulesetForRequest`)
  - `indexed_rule.cc` (`ValidateHeadersForModification`)
  - `components/url_pattern_index/url_pattern_index.cc` (`DoesOriginMatchInitiatorDomainList`)
- [C11] Chrome docs, chrome.webRequest (`extraHeaders`; extensions "can't change the request origin or initiator"). https://developer.chrome.com/docs/extensions/reference/api/webRequest
- [C12] Chrome docs, chrome.offscreen. https://developer.chrome.com/docs/extensions/reference/api/offscreen ; `extensions/browser/offscreen_document_host.h`.
- [C13] `extensions/browser/api/offscreen/lifetime_enforcer_factories.cc`.
- [C14] Chrome docs, The extension service worker lifecycle. https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- [C15] Chrome docs, chrome.scripting. https://developer.chrome.com/docs/extensions/reference/api/scripting ; What's new. https://developer.chrome.com/docs/extensions/whats-new
- [C16] `extensions/common/api/content_scripts.idl` at tag `110.0.5481.177` versus `content_scripts_handler.cc` at `111.0.5563.64`.
- [C17] Chrome docs:
  - Permissions list. https://developer.chrome.com/docs/extensions/reference/permissions-list
  - Declare permissions. https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
  - Permission warnings. https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings
- [C18] `chrome/app/generated_resources.grd` (`IDS_EXTENSION_PROMPT_WARNING_1_HOST`, `…_HOST_AND_SUBDOMAIN`, `…_DECLARATIVE_NET_REQUEST`); `chrome/common/extensions/permissions/chrome_permission_message_provider.cc`.
- [C19] Chrome docs, manifest key `incognito`. https://developer.chrome.com/docs/extensions/reference/manifest/incognito
- [C20] `content/browser/renderer_host/ancestor_throttle.cc` (`EvaluateXFrameOptions`); `chrome/browser/chrome_content_browser_client.cc` (`ShouldTreatAsFirstPartyWhenTopLevel`).
- [C21] Privacy Sandbox, "Next steps for Privacy Sandbox and tracking protections in Chrome" (2025-04-22). https://privacysandbox.google.com/blog/privacy-sandbox-next-steps
- [C22] Chromium Dash, current Stable. https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1
- [C23] WHATWG Fetch issue #1878, "Allow user agents to use more permissive header validation in extensions" (open). https://github.com/whatwg/fetch/issues/1878
- [C24] `chrome/browser/net/profile_network_context_service.cc` (`third_party_cookies_allowed_schemes.push_back(extensions::kExtensionScheme)`).

**Firefox and Mozilla.** Source paths are under https://searchfox.org/firefox-main/source/ (raw: https://raw.githubusercontent.com/mozilla-firefox/firefox/main/).
- [F1] MDN:
  - Content scripts, "XHR and Fetch". https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
  - `manifest.json/content_scripts`. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts
  - `web_accessible_resources`. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/web_accessible_resources
- [F2] Bug 1578405, "Deprecate Cross-Origin requests from content scripts in Manifest v3", FIXED in 101. https://bugzilla.mozilla.org/show_bug.cgi?id=1578405
- [F3] Firefox source:
  - `toolkit/components/extensions/ExtensionContent.sys.mjs` ("In MV3, fetch/XHR have the same capabilities as the web page"; `#injectIntoMainWorld`; container origin attributes)
  - `dom/base/Document.cpp` (`GetCookie`)
  - `dom/xhr/XMLHttpRequestMainThread.cpp`
  - `dom/security/nsContentSecurityManager.cpp`
- [F4] `toolkit/components/extensions/test/xpcshell/test_ext_secfetch.js`.
- [F5] MDN browser-compat-data `webextensions/manifest/content_scripts.json` and `api/scripting.json`; bug 1736575 (FIXED 128); Firefox 128 release notes. https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/128
- [F6] Bug 1900410, "Redact filename from MAIN world scripts" (FIXED 129). https://bugzilla.mozilla.org/show_bug.cgi?id=1900410
- [F7] `netwerk/cookie/CookieCommons.cpp` (`IsSameSiteForeign`); `caps/ContentPrincipal.cpp` (`MayLoadInternal`, `AddonAllowsLoad`); bug 1629436 (FIXED mozilla77). https://bugzilla.mozilla.org/show_bug.cgi?id=1629436
- [F8] Partitioning:
  - `caps/BasePrincipal.cpp` (`IsThirdPartyURI`)
  - `netwerk/cookie/CookieService.cpp`
  - `toolkit/components/antitracking/AntiTrackingUtils.cpp`
  - `browser/app/profile/firefox.js` (`network.cookie.cookieBehavior` 5)
  - MDN cookies API ("From Firefox 103, dynamic partitioning is the default"; "iframes in Firefox's extension documents do not use partitioned storage"). https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/cookies
- [F9] Bug 1670278 (NEW). https://bugzilla.mozilla.org/show_bug.cgi?id=1670278
- [F10] MDN `manifest.json/incognito` ("Firefox doesn't support "split" mode"); bug 1380812 (NEW).
- [F11] Bug 1807830, "Implement chrome.offscreen", WONTFIX. https://bugzilla.mozilla.org/show_bug.cgi?id=1807830 ; MDN `manifest.json/background` (no `service_worker`, bug 1573659).
- [F12] `dom/security/FramingChecker.cpp`; bug 1595652 (extension XFO exemption, reverted in 77).
- [F13] DNR:
  - Bug 1782685, "[DNR] Ship DNR API on release", FIXED 113. https://bugzilla.mozilla.org/show_bug.cgi?id=1782685
  - MDN declarativeNetRequest. https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest
  - `toolkit/components/extensions/ExtensionDNR.sys.mjs` (`RequestDetails.fromChannelWrapper`, `canExtensionModify`, `isRestrictedPrincipalURI`: "moz-extension: is not restricted because an extension always has permission to its own moz-extension:-origin"; own-extension filtering; `#checkHostHeader`)
- [F14] `toolkit/components/extensions/test/xpcshell/test_ext_dnr_modifyHeaders.js`.
- [F15] Event pages:
  - `toolkit/components/extensions/parent/ext-backgroundPage.js` (`extensions.background.idle.timeout`, 30000 ms)
  - MDN Background scripts
  - Bug 2081340 (NEW)
- [F16] Host permissions:
  - MDN `manifest.json/host_permissions` (Firefox 127 install prompt; updates; revocation). https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions
  - Bug 1889402 (FIXED 127)
  - Bug 1893232 (NEW)
- [F17] Prompt strings and formatting:
  - `toolkit/locales/en-US/toolkit/global/extensions.ftl` (`webext-perms-host-description-*`)
  - `toolkit/locales/en-US/toolkit/global/extensionPermissions.ftl`
  - `toolkit/components/extensions/Extension.sys.mjs` (`formatPermissionStrings`, `fullDomainsList`)
  - `toolkit/components/extensions/ExtensionPermissionMessages.sys.mjs`
  - `toolkit/components/extensions/schemas/*.json` (`PermissionNoPrompt`, `OptionalPermissionNoPrompt`)
- [F18] Mozilla release calendar:
  - ESR releases API. https://whattrainisitnow.com/api/esr/releases/
  - ESR page. https://whattrainisitnow.com/release/?version=esr
  - Release schedule. https://whattrainisitnow.com/api/release/schedule/?version=release
- [F19] Bug 1405971, "Webextension UUID leak to servers via Fetch request headers" (NEW). https://bugzilla.mozilla.org/show_bug.cgi?id=1405971
- [F20] Mozilla Add-ons Blog, "Manifest V3 & Manifest V2 (March 2024 update)" (blocking webRequest kept). https://blog.mozilla.org/addons/2024/03/13/manifest-v3-manifest-v2-march-2024-update/
- [F21] `toolkit/mozapps/extensions/AddonManager.sys.mjs` (`updatePromptHandler`); `browser/modules/ExtensionsUI.sys.mjs`.

**YouTube and client libraries**
- [Y1] yt-dlp `yt_dlp/extractor/youtube/_base.py` at `8973412` (`_make_sid_authorization`, `_get_sid_cookies`, `_generate_cookie_auth_headers`, `generate_api_headers`). https://github.com/yt-dlp/yt-dlp/blob/897341241f2bfb2439fe0367f4c7c9ccd29a3828/yt_dlp/extractor/youtube/_base.py
- [Y2] YouTube.js at `c4a7b3f`: `src/utils/Utils.ts` (`generateSidAuth`), `src/utils/HTTPClient.ts`, `src/core/Session.ts`, `examples/browser/README.md`. https://github.com/LuanRT/YouTube.js/tree/c4a7b3f876114fea656de3d26ca9dfade94aa034
- [Y3] YouTube's web client bundle `ytmainappweb.kevlar_base.en_US`, client version 2.20261016.01.00, and the www.youtube.com page (`ytcfg`), both fetched 2026-10-19. The bundle URL rotates, so this is a point-in-time source.
- [Y4] Probes run with curl on 2026-10-19 from a German IP, signed out:
  - `docs/research/request-context/probe-origin.sh`: the Origin gate, including a fake-SAPISID write;
  - `frame-headers.sh`: X-Frame-Options and `frame-ancestors`;
  - `curl -D -` against `/`, `/watch` and `/embed/…`: the CSP (`require-trusted-types-for 'script'`; a nonce and `'strict-dynamic'` `script-src`; no `connect-src`).
- [Y5] Open-source precedents:
  - `dancormier/Youtube-Playlist-Organizer` @`1864007` (`content/innertube.js`: hash from `document.cookie` in a content script, `browse/edit_playlist`)
  - `hellpanderrr/YTSubExtract` @`75284e6` (`rules.json`: DNR sets `Origin`/`Referer` for `youtubei/v1`)
  - `n4ze3m/page-assist` @`ad6ef90` (`src/libs/runtime.ts`: DNR `initiatorDomains: [runtime.id]` on Chrome, blocking `webRequest` on Firefox)
  - `chrismeeky/youtube-toolkit` @`5766f7d` (README: YouTube returns 403 to a `chrome-extension://` origin; anecdotal)
- [Y6] Rebuild ticket 03 research, `docs/research/store-policy.md` on branch `research/store-policy`: §Answer items 2 to 4, §2.3, and precedents P1 (Multiselect for YouTube™, MAIN-world content script) and P6 (YouTube Watch Later, `chrome.cookies` in the background).

**WXT**
- [W1] WXT docs, Content scripts (§ "Isolated World vs Main World", `injectScript`). https://wxt.dev/guide/essentials/content-scripts ; source `docs/guide/essentials/content-scripts.md`.
- [W2] WXT source at `46d4ead`:
  - `packages/wxt/src/types.ts` (`MainWorldContentScriptEntrypointOptions`, no `ctx`)
  - `packages/wxt/src/internal-utils/content-script-utils.ts` (`world: options.world`)
  - `packages/wxt/src/utils/inject-script.ts` (`keepInDom`, `modifyScript`; needs `web_accessible_resources`)
  - `packages/wxt/src/internal/manifest.ts` (Firefox MV3 `background.scripts`, Chrome `service_worker`)
  - https://github.com/wxt-dev/wxt
- [W3] WXT PR #2621 (merged 2026-10-04, unreleased): removes "`world: "MAIN"` is only supported by Chromium browsers". https://github.com/wxt-dev/wxt/pull/2621
- [W4] Other WXT sources:
  - npm `wxt` latest 0.21.4. https://registry.npmjs.org/wxt/latest
  - Offscreen example. https://github.com/wxt-dev/examples/tree/main/examples/offscreen-document-setup
  - Issue #1845 (`declarative_net_request` manifest type). https://github.com/wxt-dev/wxt/issues/1845
