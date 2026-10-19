# Store policy and YouTube's terms for 2.0

Research for rebuild ticket 03 (`.scratch/rebuild/issues/03-store-policy.md`). The question: can 2.0 send YouTube's undocumented internal requests on the user's behalf, through their own signed-in session, and stay listed on Firefox Add-ons (AMO) and the Chrome Web Store (CWS)?

Every source was read on **2026-10-19** unless stated otherwise. Bracketed IDs such as [A1] point to the [Sources](#sources) list, which also gives each page's own "last updated" date. Claims marked **(unverified)** could not be confirmed from a primary source. This is a reading of published policy, not legal advice.

## Answer

**AMO: allowed.** No AMO policy forbids an add-on from sending a website's own requests through the user's session [A1]. The rules that apply:
- Ship all code in the package.
- Don't obfuscate.
- Hand in buildable sources.
- Request only the permissions you need.
- Declare data practices accurately.
- Don't leak user data to web pages.
- Don't store data from private windows.
- Give reviewers a way to test.

At least one MV3 add-on that does exactly this is listed today: Multiselect for YouTube™ [P1]. It calls `youtubei/v1/browse/edit_playlist` with a `SAPISIDHASH` header and declares `data_collection_permissions: none`.

**`data_collection_permissions: none` can probably stay, but nobody has confirmed it (unverified).**
- *Against:* AMO's definition of "transmission" covers anything "handled outside of the add-on or the local browser" [A1], and it has no carve-out for requests to the site the user is already using.
- *For:* the listed AMO precedents that do the same thing all declare `none` [P1, P5, P8]. One of them was created in August 2026, after the declaration became mandatory for new add-ons [P5].
- *Condition:* `none` holds only while nothing leaves the browser except the requests YouTube's own UI would send for the same action. That means no server, telemetry, remote config or error reporting.
- *Next step:* ask AMO reviewers before 2.0 ships.

**Chrome Web Store: allowed in practice, though no policy says so explicitly.**
- *Program policies:* none forbids it, and MV3's remote-code rule is met when all logic ships in the package [C1, C3].
- *Precedent:* listings with 1,000 to 400,000 users do exactly this [P1–P6].
- *Residual risk:* the Developer Agreement bars any activity, publishing included, that "knowingly violates a third party's terms of service" [C10]. YouTube's ToS bans automated access [Y1], and Google owns both the store and YouTube. That gives Google discretion to remove the listing. I found no case of a removal for this reason (unverified absence).
- *Paperwork:* a single-purpose statement and per-permission justifications [C5]. Because 2.0 handles user data even locally, it also needs a privacy policy, data-type disclosures and a Limited Use certification [C2 Q3, Q14].

**YouTube's terms: a grey zone that binds users, not the stores.**
- *Users:* the ToS bars accessing YouTube "using any automated means (such as robots, botnets or scrapers)", with exceptions only for search engines and written permission [Y1]. robots.txt disallows `/youtubei/` for every user agent [Y2].
  - A user-triggered save through an extension is arguably the user using a feature YouTube offers.
  - Auto-add is automated by design.
  - Neither reading is settled.
- *Developers:* the YouTube API Services policies expressly ban undocumented APIs and scraping [Y5]. But they bind only API clients, and 2.0 isn't one unless it also calls the Data API.

**Account risk: low but not zero.**
- *No reported cases:* I found no reports of accounts being actioned for using session-based playlist extensions (unverified absence). Combined, those extensions have hundreds of thousands of users.
- *Heavy automation does draw action:* yt-dlp warns that heavy automated use of an account can get it banned. It cites a rate limit of about 2,000 videos an hour for signed-in accounts [Y7].
- *2.0's volume:* a few requests per watched video.
- *Grounds:* YouTube can suspend accounts for "material or repeated" breach [Y1].

**Naming verdict.**
- **Chrome:** don't call the listing "YouTube Playlist Tools".
  - *Rule:* the CWS branding rules forbid Google trademarks as an extension's name without permission. They prescribe "for", "for use with" or "compatible with" plus ™ [C9], and YouTube™ is on Google's trademark list [G1].
  - *Enforcement:* a Chrome item named "YouTube Tweaks" was removed for US users over "Infringement of Google's YouTube word trademark" and wasn't reinstated [C14].
  - *Name taken:* "YouTube Playlist Tools" is already a live Chrome listing by another developer, with overlapping queue and Watch Later features [N1].
  - *What fits:* a "… for YouTube™" name with the attribution line.
  - *Pick something distinct:* "Playlist Tools for YouTube™" complies but sits next to two similar listings [N1, N2].
- **AMO:** no rule forces a rename. AMO's only naming rule is about Mozilla's own marks [A1]. Third-party trademarks fall under the IP clauses and takedown requests [A5, A6].
- **Google's own rules still apply everywhere.** Its general trademark guidelines say not to put its marks into product names [G2]. Using one "… for YouTube™" name on both stores is the low-risk choice.

**What 2.0 must do to comply:**
1. **Ship every line of logic in the package.**
   - No remote code.
   - No runtime-fetched selectors or endpoint configs that steer behaviour [A1, A3, C3]. A hotfix config would also break "no server of ours".
2. **Let YouTube's own page client authenticate requests where possible.** Reading the SAPISID cookies (to build `SAPISIDHASH`) or holding the `cookies` permission puts "Authentication information" in the CWS disclosures [C2 Q4] and lengthens review [C7]. Never rewrite Origin or Referer to make requests pass; YouTube's ToS forbids circumventing "security-related features" [Y1].
3. **Request the narrowest permissions and justify each one** [C1, C5, A1]. Drop 1.5.0's unused `scripting` and `activeTab`, and the `identity` and googleapis host permissions that go with the retired OAuth.
4. **Keep extension data out of the page world.**
   - Pass YouTube's page context only what each request needs, never the settings or the account map [A1 §6.3].
   - Don't make one container's identity visible in another container's YouTube [A1 §6.3].
   - Don't persist records from private windows, or don't run in them [A1 §6.3].
5. **Keep auto-add opt-in, and show a first-run disclosure with an explicit "OK" before handling any data.** The disclosure says what the extension reads on YouTube and that it acts as the signed-in user. Chrome requires prominent disclosure and affirmative consent [C1, C2 Q10]. It doubles as the missing onboarding.
6. **Use the same listing text on both stores.** It must say:
   - what it does;
   - that it acts as the signed-in user, through YouTube's own web requests;
   - that nothing goes to the developer;
   - that a YouTube change can break it;
   - that it isn't affiliated with or endorsed by Google or YouTube [C1];
   - the trademark attribution line [C9].

   A draft is in [section 6](#6-draft-listing-text-dashboard-answers-and-reviewer-notes).
7. **Publish a privacy policy page with the Limited Use statement**, and fill in the CWS privacy tab [C1, C5].
8. **Hand AMO buildable sources with a reviewer README** [A3, T1]:
   - the Bun 1.4.0 install command;
   - the build commands;
   - the lockfile;
   - a note that the default reviewer machine is ARM64 Linux with Node and npm, not Bun.

   Also give AMO testing instructions or credentials for a YouTube account [A1 §3].
9. **Don't call the YouTube Data API from 2.0.** The same extension calling both would breach the API Developer Policies' bans on undocumented APIs and scraping [Y5]. This narrows the map's "fallback on the user's own Google credentials" option.

## 1. Firefox Add-ons (AMO)

### 1.1 Acting through the user's session

- The Add-on Policies (last updated 2026-04-30) contain no rule about which sites an add-on may talk to, or through whose session [A1]. The rules that matter:
  - **No surprises:** the listing "should include an easy-to-read description of what the add-on does, and what information it transmits" [A1 §1].
  - **Permissions:** "Add-ons must only request those permissions that are necessary for them to function." [A1 §4]
  - **Functionality:** "Add-ons must function only as described." [A1 §3]
- AMO's Acceptable Use Policy bars violating the terms of service of *Mozilla* services, not of third-party sites [A6].
- The Distribution Agreement asks the developer to warrant they hold the rights to distribute the add-on [A5]. Neither document makes YouTube's ToS an AMO review criterion.

### 1.2 Remote code and reviewability

- **Self-contained:** "Add-ons must be self-contained and not load remote code for execution." [A1 §4]
  - Calling functions YouTube's page already has (today's `resolveCommand` bridge) or sending hand-built `youtubei/v1` requests isn't loading remote code.
  - The bridge script itself must ship in the package, as `yt-queue-bridge.js` does today.
- **No hidden logic:** "Add-ons are not allowed to contain obfuscated code, nor code that hides the purpose of the functionality involved. If external resources are used in combination with add-on code, the functionality of the code must not be obscured." [A1 §3.1]
- **Remote data:** the source-code guide adds that "Remote resources, such as data files, are not allowed to be used to obscure the logic of your add-on … cannot be concealed by making control flow decisions based on these external resources" [A3].
  - This matters for ticket 18 (breakage): a remotely fetched selector or endpoint map would be reviewed with suspicion.
  - It would also need a server, which ADR-0001 rules out.
- **No relaxed security headers:** "Add-ons must not relax web page security headers, such as the Content Security Policy." [A1 §4] 2.0 must not strip YouTube's CSP to inject scripts; the MAIN-world content script or the packaged injected script avoids that.

### 1.3 Data collection and `data_collection_permissions`

**The rules**
- **Definition:** "data transmission refers to any data that is collected, used, transferred, shared, or handled outside of the add-on or the local browser." [A1 §6]
- **Prohibited:**
  - "Transmitting or facilitating the transmission of ancillary information (e.g. any data not required for the add-on's functionality as stated in the description)."
  - "The transmission of browsing activity is only permitted as part of the add-on's primary function." [A1 §6.1]
- **Manifest accuracy:** on Firefox 140+ with built-in consent, the add-on "must accurately state the data collection practices in the extension manifest, including when it does not collect data" [A1 §6.2.1].
- **Taxonomy:** the Mozilla data types include [A2]:
  - `browsingActivity`: "specific URLs, domains, or categories of pages users view";
  - `websiteContent`: including "cookies … and request and response information";
  - `websiteActivity`: "actions, such as saving and downloading".
- **Timeline** [A2, A4]:
  - New add-ons have had to declare the key since 2025-11-03.
  - Add-ons created before then "don't need to use this feature, but will have to at a later date". No date had been set as of the A2 page's 2026-03-12 update.
  - "Once any extension starts using these data_collection_permissions keys in a new version, it will need to continue using them for all subsequent versions."
- **Where this add-on stands:**
  - The live 1.4.5 has no key [A7].
  - 1.5.0's `wxt.config.ts` already sets `required: ["none"]` but never shipped.
  - So 2.0 will be the first AMO version carrying the key, and it must keep it from then on.
- **Updates:** "When an extension is updated, Firefox only shows the added required data permissions, unless it's the special `none` data type" [A2].
- **Consent on older Firefox:** if 2.0 declares any data type and supports Firefox older than 140, it also needs a custom consent screen [A1 §6.2.2, A2]. Otherwise it has to raise `strict_min_version` to 140.

**Does `none` still hold?**

What 2.0 would send:
- to YouTube only: video, playlist and channel identifiers, playlist titles, and the user's typed `@handle`;
- with the user's YouTube session attached;
- as the same requests YouTube's own web client sends for the same actions.

*Against `none`:* read literally, that is data "handled outside of … the local browser" [A1 §6]. It would map to `websiteActivity` (saving) and `browsingActivity` (which video is being watched) [A2]. In November 2025 Simeon Vincent replied under the add-ons blog post about polling a third-party service [A4]. He implied that "query parameters, headers, or a message body in a POST request" do count. The comment doesn't state his role, so whether it speaks for Mozilla is unverified. That context was a third-party service, not the site the user is on.

*For `none`:* the AMO-listed add-ons doing the same thing declare `none`:
- Multiselect for YouTube™ 4.0, MV3, updated 2026-10-10 [P1];
- YouTube Watch Later Cleaner 3.0.1 [P8];
- Watch Later Tidy for YouTube™ [P5]:
  - created on AMO on 2026-08-06, so it fell under the new-add-on requirement;
  - declares `required: ["none"]`, with optional `authenticationInfo` and `technicalAndInteraction` for its own server.

AMO accepted those versions. Whether a human reviewed them is unverified.

**Verdict.**
- Keep `none` and justify it in the reviewer notes. Nothing reaches the developer or any third party; the only recipient is youtube.com, the service the user is using; and the requests are the ones YouTube's own UI sends.
- If a reviewer disagrees, fall back to `required: ["websiteActivity"]` and raise `strict_min_version` to 140.
- Two points are unconfirmed and should be asked of AMO before submission:
  - Mozilla has published no ruling on first-party requests to the visited site.
  - Settings sync through `storage.sync` (an approved 2.0 capability) passes data through Firefox Sync. Whether that counts as "transmission" is also unconfirmed.

### 1.4 Privacy rules that constrain the design

From §6.3 of the policies [A1]:
- "Leaking local or user-specific information to websites or other applications … is prohibited." A MAIN-world bridge talks to the page through DOM events the page can read. Each event should carry only what its request needs, never the settings, filters or account map.
- "Data from private browsing sessions must not be stored." Auto-add or quick-save in a private window must not write the duplicate cache, channel cache or any history. The alternative is to not run in private windows at all.
- "Information that identifies a user across browsing sessions or containers must not be made available to web content." This matters for the approved per-account setup (ticket 11): a YouTube tab in one container must not show the account or settings of another container.

### 1.5 Source-code submission for the Bun/WXT build

**What AMO requires** [A1 §3.1, A3]:
- Sources are mandatory for bundled or minified builds.
- Reviewers rebuild from the sources and diff the result: "There must be no differences."
- Build tools "must be open source" and "cannot be web-based".
- "All dependencies must either be included in the source code package directly or downloaded only through the respective official package managers during the build process."
- "Build tools or environments that no longer appear to be supported by their maintainers are not accepted."
- Include the lockfile.

**The reviewer machine:** the default reviewer environment is "Ubuntu 24.04.4 LTS (Desktop edition)", "ARM64 CPU architecture", "Node 24.14.0 and npm 11.9.0" [A3]. "You must let the reviewers know if any of the above differs from your build environment … Otherwise … your submission may be rejected." (The page footer says it was last updated in 2019, yet it lists Node 24.14.0, so the footer is stale.)

**How Bun and WXT fit:**
- Bun is MIT-licensed [T3] and has Linux ARM64 builds. A pinned version installs with `curl -fsSL https://bun.com/install | bash -s "bun-v<version>"` [T2].
- WXT documents Bun for the Firefox sources zip: `bun install` then `bun run zip:firefox`. It asks for a `README.md` or `SOURCE_CODE_REVIEW.md` in the sources with those commands [T1].
- The repo already ships `bun.lock`, and `release.yml` already checks that the sources zip rebuilds. It runs that check on x64 only.

**What 2.0 should do:**
- Add a reviewer README to the sources zip: OS, Bun 1.4.0 and how to install it, the exact commands, and the output folder (`.output/firefox-mv3`).
- Run the rebuild check on an ARM64 Linux runner too.

**Still open:** AMO's pages name npm and yarn but not Bun. Whether reviewers accept Bun, and whether `bun install` counts as an "official package manager" for npm-registry packages, is unverified. No precedent was found either way.

### 1.6 Review logistics

"If an account is needed for any part of the add-on's functionality, [the author must provide] testing credentials to allow use of the add-on." [A1 §3] 2.0 needs a signed-in YouTube account. Plan either:
- a dedicated test Google account with a channel and a few playlists, with its credentials in the reviewer notes; or
- a note that any Google account with a YouTube channel works.

Whether reviewers accept the second option is unverified.

## 2. Chrome Web Store

### 2.1 Is it allowed?

**What the policies say**
- No program policy forbids sending a site's own requests through the user's session [C1].
- The clauses closest to the question:
  - "Do not facilitate unauthorized access to content on websites, such as circumventing paywalls or login restrictions." [C1] 2.0 only acts on the signed-in user's own playlists, so it isn't unauthorized access.
  - "We don't allow content that harms or interferes with the operation of the networks, servers, or other infrastructure of Google or any third-parties." [C1] Human-scale request volume keeps 2.0 clear of this.
  - "We don't allow extensions that send messages on behalf of the user without giving the user the ability to confirm the content and intended recipients." [C1] Playlist edits aren't messages.

**What the Developer Agreement adds**
- §4.4.1: the developer won't publish products that "knowingly violates a third party's terms of service" or "interferes with … or accesses in an unauthorized manner the … servers … of any third party including … Google" [C10].
- Google may remove a product that "may create liability for Google or any third party" [C10].
- With YouTube's automated-access clause [Y1], this is the real exposure: discretionary removal, most likely after a complaint rather than at review.

**What happens in practice**
- The listings in [section 4](#4-precedent) do the same thing at scale [P1–P6].
- The largest has 400,000 users and was updated 2026-10-18 [P2].

### 2.2 Single purpose

- **The rule:** "An extension must have a single purpose that is narrow and easy to understand." [C1] A single purpose can be "a narrow focus area or subject matter … then it can offer various functions related to that focus area" [C4].
- **Why 2.0 fits:** everything 2.0 does is about saving YouTube videos into the user's own lists. That covers auto-add with channel filters, shortcuts, quick-save and queue buttons, Watch Later, playlist creation, and theming of its own UI.
- **Right-click card menu:** this feature opens YouTube's own ⋮ menu, where Save, Add to queue and Watch Later live. Describe it as quick access to those save options so it reads as part of the purpose.
- **Permissions:** "Excessive permissions unrelated to your extension's single purpose will be viewed as enabling unrelated functionalities" [C4].

### 2.3 Permissions and justifications

**The rules**
- "Request access to the narrowest permissions necessary … Don't attempt to 'future proof' your Product." [C1]
- The dashboard has a justification field for each permission [C5].
- An extension that requests a permission it doesn't use is rejected as "Purple Potassium" [C6].
- `activeTab` isn't needed "when the extension has access to … host permissions for the specific domains that are relevant" [C6].
- Review takes longer for broad host permissions and for "sensitive execution permissions … (for example, cookies and webRequest)" [C7].

**What that means for 2.0:** request `storage` and `https://www.youtube.com/*`, plus only what ticket 02 proves necessary. Avoid `cookies`, `tabs`, `activeTab`, `scripting` (unless called), `identity`, `webRequest` and `declarativeNetRequest`. Draft justifications are in [section 6](#6-draft-listing-text-dashboard-answers-and-reviewer-notes).

### 2.4 User data: privacy policy, disclosures, Limited Use

**Local handling still counts**
- "Does an extension need to disclose user data handling if the data is only processed or stored locally on a user's device? Yes." [C2 Q3]
- A privacy policy is required even when data "only stores information locally (or only uses Chrome Storage Sync API)" [C2 Q14].
- "Handle" includes "Collecting web browsing activity and any information about the website content or resources a user requests or interacts with, including … the content of the HTTP requests and responses, and data in a website's browser storage (like cookies)" [C2 Q2].
- Authentication information includes "authentication cookies" [C2 Q4].

**What 2.0 handles**
- Watch-page video IDs (web history).
- Playback progress and shortcut key presses on YouTube (user activity).
- Playlist, video and channel data read from YouTube (website content).
- YouTube's auth cookies, if it reads them itself.

**Disclosure and consent**
- Before handling user data, an extension must "Prominently disclose what user data will be collected and how it will be used" and "Obtain the user's affirmative and informed consent" [C1].
- The FAQ says this disclosure "must occur within the Product's user interface. Disclosures in the Chrome Web Store description … do not satisfy this requirement" [C2 Q10].
- The newer troubleshooting page says "Prominent disclosure of data collection in the extension's Chrome Web Store listing is sufficient" [C6, "Purple Nickel"].
- The two pages disagree, so do both: a first-run screen with an explicit OK, and the listing text.

**Limited Use**
- Data may be used "only … for the extension's disclosed single purpose" [C1].
- "Collection and use of web browsing activity is prohibited, except to the extent required for a user-facing feature described prominently in the Product's Chrome Web Store page and in the Product's user interface." [C1] Auto-add is that feature, so the listing and the popup must describe it.
- "An affirmative statement that your use of the data complies with the Limited Use restrictions must be disclosed on a website belonging to your extension." [C1] A GitHub-hosted privacy page satisfies "no server of ours".

**Dashboard data categories**

The definitions are as shown on store listings [C13]:

| Category | Definition |
|---|---|
| Web history | "The list of web pages a user has visited, as well as associated data such as page title and time of visit" |
| User activity | "network monitoring, clicks, mouse position, scroll, or keystroke logging" |
| Website content | "text, images, sounds, videos, or hyperlinks" |
| Authentication information | "passwords, credentials, security question, or personal identification number (PIN)" |

The three certifications are [C13]:
- not sold to third parties;
- not used for purposes unrelated to the core functionality;
- not used for creditworthiness.

**Consistency**
- "If the information listed in your privacy fields contradicts the information provided in your privacy policy, or the behavior of your extension, your extensions may be removed." [C1]
- The FAQ warns that discrepancies can lead to "ban of the entire publisher entity" [C2].

**What the precedents disclose**
- Most declare that they "will not collect or use your data" [P1, P3, P4, P6].
- PocketTube declares "User activity" [P2].
- Watch Later Tidy declares "Authentication information, User activity, Website content" [P5].

**What 2.0 should declare:** follow the policy text rather than the lightest precedent:
- Web history, User activity and Website content;
- Authentication information only if 2.0 reads session cookies itself;
- all three certifications.

### 2.5 Remote code under MV3

- **The rule:** "the full functionality of an extension must be easily discernible from its submitted code … external resources must not contain any logic" [C3]. The listed violations are:
  - a remote `<script>`;
  - `eval` of fetched strings;
  - "Building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data" [C3].
- **Remote configuration:** "Fetching a remote configuration file … where all logic for the functionality is contained within the extension package" is allowed on Chrome [C3], unlike AMO's stricter reading (1.2).
- **The dashboard field:** extensions that use remote code "and do not declare and justify it … will be rejected" [C5]. 2.0 answers "No".
- **YouTube's own command objects (interpretation):** 2.0 may pass YouTube's command objects back to YouTube's `resolveCommand`, as the queue bridge does. The page's own code runs them; the extension interprets nothing. Say so in the reviewer notes.
- **Readability:** "Developers must not obfuscate code … Minification is allowed" [C1].

### 2.6 Account and listing logistics

- **Developer account:**
  - A one-time registration fee [C11].
  - 2-Step Verification is required [C1].
  - The developer must declare trader or non-trader status under EU law [C12].
- **Listing:** a listing with "a blank description field or … missing an icon or screenshots … will be rejected" [C1].
- **Screenshots:** "you may use standard, unaltered screenshots of Google services" for illustration [C9].
- **Test instructions:** the dashboard's test-instructions tab is optional, "only useful if the item requires restricted credentials or a paid account" [C8]. Any Google account works for 2.0, so it isn't needed.

## 3. YouTube's terms

### 3.1 YouTube Terms of Service

These are the US terms, "Dated: December 15, 2023" [Y1].

**The relevant restrictions:** "You are not allowed to:"
- "access, reproduce, download, distribute, transmit, broadcast, display, sell, license, alter, modify or otherwise use any part of the Service or any Content except: (a) as expressly authorized by the Service; or (b) with prior written permission from YouTube …";
- "circumvent, disable, fraudulently engage with, or otherwise interfere with any part of the Service … including security-related features";
- "access the Service using any automated means (such as robots, botnets or scrapers) except (a) in the case of public search engines, in accordance with YouTube's robots.txt file; or (b) with YouTube's prior written permission";
- "cause or encourage any inaccurate measurements of genuine user engagement with the Service … or otherwise manipulate metrics in any manner".

robots.txt disallows `/youtubei/` and `/api/` for `User-agent: *` [Y2].

**How 2.0's features read against them (interpretation)**
- **Shortcut, quick-save and queue buttons:** each is one user action that produces one request. That request is identical to the one YouTube's own Save, Watch Later or Add to queue control sends. It's the user exercising a feature "expressly authorized by the Service", through different buttons.
- **Auto-add:** this fires without a click, so it is "automated means" in the literal sense. In its favour:
  - the user configured it;
  - each add is one request tied to a video the user actually watched;
  - it inflates no metric, which the fake-engagement policy targets: "anything that artificially increases the number of views, likes, comments, or other metrics" [Y3].
- **Header spoofing:** sending requests from an extension origin with rewritten Origin or Referer headers edges toward "circumvent … security-related features". Avoid it.
- **No guidance:** I found no YouTube statement on browser extensions either way (unverified absence). The brand site that might say more (brand.youtube) renders only with JavaScript and couldn't be read.

**Google's own ToS:** it separately forbids "using automated means to access content from any of our services in violation of the machine-readable instructions on our web pages (for example, robots.txt files…)" [G3]. Whether Google's ToS also governs YouTube use is unverified: YouTube's "Applicable Terms" list only YouTube's own documents [Y1].

### 3.2 YouTube API Services Terms and Developer Policies

**Scope**
- These bind whoever is "accessing or using the YouTube API Services", meaning the Data API, Reporting API and similar, plus their docs, data and credentials [Y4].
- An "API Client" is software "that accesses or uses the YouTube API Services" [Y5 §IV].
- 2.0 without the Data API isn't an API client, so these don't bind it.

**What they say about undocumented APIs**

They state YouTube's position plainly, and they would bind 2.0 the moment it also used the Data API:
- **Undocumented Services:** "You must not use undocumented APIs without express permission … You must not reverse engineer undocumented YouTube API services" [Y5 §III.D].
- **Scraping:** "You and your API Clients must not, and must not encourage, enable, or require others to, directly or indirectly, scrape YouTube Applications" [Y5 §III.E]. "YouTube Applications" means youtube.com and the like [Y5 §IV].
- **Other technology:** API clients must not "use any technology other than YouTube API Services to access or retrieve API Data" [Y5 §III.I].
- **Consent:** API clients must not "automate or trigger views, uploads, comments, likes, dislikes, or other actions without the user's prior specific and express consent" [Y5 §III.I]. This doesn't bind 2.0, but it is the same bar 2.0 should meet anyway: auto-add stays opt-in and visible.

**What this means for the map:** the map lets a capability fall back to the Data API "on the user's own Google credentials". In the same extension as the session requests, that fallback would breach §III.D and §III.E. It would also bring in:
- the API branding rule against "YouTube" in the app's name at all [Y6];
- the requirement to link YouTube's ToS and have users accept a privacy policy [Y5 §III.A].

1.5.0 already mixes the two: it calls the Data API and also reads `getPlayerResponse()` and calls `resolveCommand`. PocketTube does the same today and is still listed [P2]. Its package contains both `googleapis.com/youtube/v3/channels` and `youtubei/v1` calls. So this risk is to the API project's access, not to the store listing.

### 3.3 Practical risk to a user's account

- **Grounds:** YouTube "reserves the right to suspend or terminate your Google account or your access to all or part of the Service if (a) you materially or repeatedly breach this Agreement" [Y1].
- **Precedent:** extensions that edit playlists through the session have about 587,000 users on Chrome alone [P1–P6]. A search for reports of accounts suspended for using them found none (unverified absence; I didn't search exhaustively).
- **Heavy use:** the yt-dlp project warns: "By using your account with yt-dlp, you run the risk of it being banned (temporarily or permanently). Be mindful with the request rate." [Y7] It puts the signed-in rate limit at "~2000 videos/hour (~4000 webpage/player requests per hour)" [Y7]. That is for downloading, far heavier than 2.0's few requests per watched video.
- **How 2.0 keeps the risk low:**
  - Stay at human scale: one request per user intent, sent in sequence, with backoff on errors.
  - No background crawling of the whole library on every popup open.
  - Act only for the account signed into the tab (ticket 11).
  - Say in the listing that the extension acts as the user and that YouTube may change or restrict it.

## 4. Precedent

**How each was checked**
- Store numbers were read on 2026-10-19: Chrome "users" from the listing page, AMO average daily users from the AMO API [A7].
- "Session requests" means I downloaded the current package from the store's own download endpoint and read its code without running it. I looked for the `youtubei/v1/...` endpoints, `SAPISIDHASH`, `resolveCommand` and `ACTION_ADD_VIDEO`.

| # | Listing | Store and link | Users | Version / updated | What its code does through the user's session | Privacy disclosure |
|---|---|---|---|---|---|---|
| P1 | Multiselect for YouTube™ | [Chrome](https://chromewebstore.google.com/detail/multiselect-for-youtube/gpgbiinpmelaihndlegbgfkmnpofgfei) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/multiselect-for-youtube/) | 70,000 · 4,708 | 4.0 · 2026-10-12 (Chrome), 2026-10-10 (AMO) | `youtubei/v1/browse/edit_playlist` with `ACTION_ADD_VIDEO`/`ACTION_REMOVE_VIDEO`, `playlist/create`, `SAPISIDHASH`; queue via `resolveCommand` + `addToPlaylistCommand`. MV3, MAIN-world content script, permissions `storage` (+ `clipboardRead` on AMO) | Chrome: "will not collect or use your data". AMO: `data_collection_permissions: required ["none"]` |
| P2 | PocketTube: Youtube Subscription Manager | [Chrome](https://chromewebstore.google.com/detail/pockettube-youtube-subscr/kdmnjgijlmjgmimahnillepgcgeemffb) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-subscription-groups/) | 400,000 · 22,033 | 18.10.5 · 2026-10-18 | `browse/edit_playlist`, `playlist/create`/`delete`, `subscription/subscribe`/`unsubscribe`, `SAPISIDHASH`; also calls Data API `youtube/v3/channels` | Chrome: "User activity". AMO: no data key (MV2, created before 2025-11-03) |
| P3 | PocketTube: Youtube PlayList Manager | [Chrome](https://chromewebstore.google.com/detail/pockettube-youtube-playli/bplnofkhjdphoihfkfcddikgmecfehdd) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/pockettube-youtube-playlist/) | 60,000 · 2,634 | 3.8.1 · 2026-09-04 (Chrome); 3.10.0 · 2026-10-18 (AMO) | `browse/edit_playlist`, `playlist/create`/`delete`, `like/like`, `SAPISIDHASH`, queue via `resolveCommand` | Chrome: "User activity" |
| P4 | YT Watch Later Assist | [Chrome](https://chromewebstore.google.com/detail/yt-watch-later-assist/deafalnegnfhjhejolidiobnapigcfpd) | 50,000 | 4.1 · 2026-07-05 | Batches `ACTION_ADD_VIDEO` into Watch Later via `browse/edit_playlist` with `SAPISIDHASH` | "will not collect or use your data" |
| P5 | Watch Later Tidy for YouTube™ | [Chrome](https://chromewebstore.google.com/detail/youtube-watch-later-tidy/fkelmapobieliokjcmnilmjllacmbfjo) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/watch-later-tidy/) | 6,000 · 62 | 2.6.0 · 2026-10-15; on AMO since 2026-08-06 | `browse/edit_playlist`, `playlist/create`/`delete`, `like/*`, `SAPISIDHASH`; MAIN-world scripts | Chrome: "Authentication information, User activity, Website content". AMO: `required ["none"]`, optional `technicalAndInteraction`, `authenticationInfo` |
| P6 | YouTube Watch Later | [Chrome](https://chromewebstore.google.com/detail/youtube-watch-later/nmpfhocciajonacicdelpbhipglapgaa) · [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later/) | 1,000 · 408 | 0.6.3 · 2026-08-31 | Adds a thumbnail button. Background reads `SAPISID` cookies via `chrome.cookies` (per tab `cookieStoreId`) and posts `ACTION_ADD_VIDEO` to `WL` via `browse/edit_playlist`. Permissions `storage`, `scripting`, `cookies` | Chrome: "will not collect or use your data". AMO: no data key (created 2024) |
| P7 | Sweep — Bulk Playlist Manager for YouTube | [Chrome](https://chromewebstore.google.com/detail/coehbmpnlcgpihhkoabhkeeffpfojgaj) | 125 | 1.0.0 · 2026-06-28 | Code not inspected. Listing: "performs each action as a single request through YouTube's own web interface, under your existing signed-in session" | "will not collect or use your data" |
| P8 | YouTube Watch Later Cleaner | [AMO](https://addons.mozilla.org/en-US/firefox/addon/youtube-watch-later-cleaner/) | 1,273 | 3.0.1 · 2026-09-24 | Code contains `browse/edit_playlist` with `SAPISIDHASH`; the listing describes DOM interaction | `required ["none"]`, `strict_min_version` 128 |

P6 is the closest match to 2.0's quick-save. P1 is the closest Firefox match, including the MAIN-world approach and `none`.

Not counted as precedent: the Chrome listing "YouTube Playlist Tools" by another developer [N1]. Its package (3.20) contains none of the markers, so its queue and Watch Later buttons probably drive YouTube's menus (unverified).

## 5. Naming

### 5.1 Chrome Web Store

**The rule** (CWS Branding Guidelines [C9]):
- "Don't use any Google trademarks or any confusingly similar marks as the name of your extension or company without written permission from Google."
- "If your product is compatible with a Google product, make reference to that Google product by using the text 'for', 'for use with', or 'compatible with', and be sure to include the ™ symbol with the Google trademark. Example: 'for Google Chrome™'."
- Attribution in the description: "Google Maps is a trademark of Google LLC. Use of this trademark is subject to Google Permissions."
- "Don't use Google trademarks or a modified version of a Google trademark as the logo for your extension."

**Why it covers YouTube:** "YouTube™ video community" is on Google's trademark list [G1]. Google's general guidelines add "Don't incorporate Google Brand Features into your own product names" and "Don't display Google Brand Features in any manner that implies a relationship with, affiliation with, sponsorship by, or endorsement by Google" [G2].

**Enforcement:** it is complaint-driven, and it happens [C14].
- A Chrome item named "YouTube Tweaks" was removed for US users in September 2023.
  - The complaint, as the developer quoted it: "Infringement of Google's YouTube word trademark."
  - The notice also cited "your use of YOUTUBE RED", and the developer suspected a promo image with YouTube's play button. So the name and the imagery were both in play.
  - The store "will not reinstate the item". It suggested publishing a new, non-infringing version under a new item name.
- Oliver Dunk, Chrome Extensions DevRel, wrote in the thread: "Most extensions I see made by a third-party are named 'Something *for* Product Name'". He added that he "wouldn't be surprised if the name of your extension is also flagged in the future".
- Meanwhile, listings that lead with "YouTube" are still live [P6, N1], so review doesn't block such names up front. They stay exposed to a complaint.

**Look and feel:** Google's guidelines also say "Don't copy or imitate Google's trade dress, including the look and feel of Google web design properties … distinctive color combinations, typography, graphic designs, product icons, or imagery associated with Google" [G2].
- *In-page UI:* matching YouTube's theme there is common among listed extensions. PocketTube advertises playlists "that seamlessly fit into the layout" [P2 AMO listing]. That fits the map's "Inside YouTube, look like YouTube".
- *The extension's own identity:* the icon, store graphics, popup branding and name should not borrow YouTube's red play-button look. 1.5.0's popup uses YouTube red as its primary colour, which is worth revisiting for store screenshots.

**Verdict:** a new Chrome listing called "YouTube Playlist Tools" breaks [C9]. It should be "<Name> for YouTube™", with the attribution line "YouTube is a trademark of Google LLC. Use of this trademark is subject to Google Permissions." in the description. The current icon, a grey "playlist add" glyph, contains no YouTube mark, so it complies.

### 5.2 AMO

- **Mozilla's only naming rule:** "If the add-on uses 'Firefox' in its name, the naming standard the add-on is expected to follow is '<Add-on name> for Firefox'." [A1 §2] There's no equivalent rule for third-party marks.
- **Third-party marks:**
  - The Acceptable Use Policy bars violating "the copyright, trademark, patent, or other intellectual property rights of others" [A6].
  - The Distribution Agreement makes the developer warrant they hold the necessary trademark rights [A5].
  - It also points trademark holders to a take-down process [A5].
- **Verdict:** AMO doesn't require a rename. The listing has been "YouTube Playlist Tools" since 2024-06-18 [A7]. Google's guideline [G2] still applies, and Google could file a takedown on AMO as it did on Chrome.

### 5.3 Collisions and a recommendation

**Taken or nearly taken names:**
- [N1] Chrome: "YouTube Playlist Tools" by Blake Sinnett, 289 users, v3.20, updated 2026-09-19. "One-click actions: instantly add videos to your queue or Watch Later list."
- [N2] Chrome: "playlist.tools - YouTube Playlist Manager", 627 users.
- [N3] AMO: "YT Playlist Tools — Reverse, Shuffle & Reorder", 264 users.

**Examples of the "for YouTube™" form:** Enhancer for YouTube™ (595,136 AMO users) [A7], Multiselect for YouTube™ [P1], Watch Later Tidy for YouTube™ [P5].

**Recommendation:**
- Pick one name in the "<Distinct name> for YouTube™" form and use it on both stores. The manifest `name` becomes the Chrome title, and WXT builds both stores from one config.
- Keep the AMO slug and gecko ID; renaming doesn't change either.
- "Playlist Tools for YouTube™" is compliant but easy to confuse with N1–N3. Choosing the name is the user's decision.

## 6. Draft listing text, dashboard answers and reviewer notes

Finalise these after tickets 02 and 10 fix the permissions and request paths.

**Listing paragraph (both stores):**
> {Name} works inside your signed-in YouTube session. When it saves a video, it sends YouTube the same request YouTube's own Save, Watch Later or Add to queue button sends. It needs no Google sign-in, API key or password. Nothing is sent to the developer or to anyone other than YouTube; your settings stay in your browser {and your browser's own sync, if you turn it on}. It relies on how YouTube's website works today, so a YouTube change can break it until an update ships. Not affiliated with or endorsed by YouTube or Google. YouTube is a trademark of Google LLC. Use of this trademark is subject to Google Permissions.

**Chrome single-purpose field:**
> Saves YouTube videos into the signed-in user's own YouTube playlists, Watch Later and play queue: automatically after a video is watched (optionally filtered by channel), with keyboard shortcuts, or from buttons on video thumbnails.

**Chrome permission justifications (likely set):**
- `storage`: "Keeps the user's settings (auto-add playlists, channel filters, shortcuts, watch threshold, theme) and a local record of videos already added."
- `https://www.youtube.com/*`: "The extension's only site. Content scripts read playback progress on watch pages for auto-add, add the quick-save and queue buttons and shortcuts, and send YouTube's own save requests in the user's signed-in session."
- Anything else only if ticket 02 proves it necessary, each with its own one-line reason.

**Chrome remote-code field:** "No. All code ships in the package. The extension sends requests to youtube.com and calls functions that YouTube's own page provides; it fetches and evaluates no code."

**Chrome data usage:**
- Tick Web history, User activity and Website content, plus Authentication information if 2.0 reads session cookies.
- Tick all three certifications.
- Link the privacy page that carries the Limited Use statement [C1].

**AMO reviewer notes:**
- Explain the mechanism (MAIN-world script or the page's own client), and list which `youtubei/v1` endpoints or commands are used and why.
- Give the reasoning for `data_collection_permissions: none` (1.3).
- Point to the sources README.
- Give test-account instructions.

## 7. Open questions and unverified points

- Does AMO accept `none` for requests made only to the site the user is on (1.3)? Does `storage.sync` count as transmission? Ask on the AMO reviewer channel or Mozilla Discourse before submitting.
- Do AMO reviewers accept a Bun build and Bun's lockfile? The default environment is Node and npm on ARM64 (1.5).
- Will AMO reviewers accept "use any Google account" in place of test credentials (1.6)?
- The Chrome user-data FAQ and the troubleshooting page disagree on whether a listing disclosure is enough (2.4).
- No YouTube statement on browser extensions was found, and brand.youtube couldn't be read (3.1).
- Absence of reported account bans and of store removals for session-based YouTube extensions is a search result, not proof (2.1, 3.3).
- The Chrome trademark-removal case is known only through a forum thread (5.1).

## Sources

All read 2026-10-19. "Updated" is the page's own last-updated date where it shows one.

**Mozilla / AMO**
- [A1] Add-on Policies. https://extensionworkshop.com/documentation/publish/add-on-policies/ (updated 2026-04-30)
- [A2] Firefox built-in consent for data collection and transmission. https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/ (updated 2026-03-12)
- [A3] Source code submission. https://extensionworkshop.com/documentation/publish/source-code-submission/ (footer says 2019-06-10; content lists Node 24.14.0)
- [A4] "Announcing data collection consent changes for new Firefox extensions", Mozilla Add-ons Blog, 2025-10-23, and its comments. https://blog.mozilla.org/addons/2025/10/23/data-collection-consent-changes-for-new-firefox-extensions/
- [A5] Firefox Add-on Distribution Agreement. https://extensionworkshop.com/documentation/publish/firefox-add-on-distribution-agreement/ (updated 2021-12-01)
- [A6] Mozilla Acceptable Use Policy. https://www.mozilla.org/en-US/about/legal/acceptable-use/
- [A7] AMO API v5 add-on records, e.g. https://addons.mozilla.org/api/v5/addons/addon/youtube-playlist-tools/ and https://addons.mozilla.org/api/v5/addons/search/?q=playlist%20tools&app=firefox&type=extension

**Build tooling**
- [T1] WXT, Publishing (Firefox sources ZIP). https://wxt.dev/guide/essentials/publishing.html
- [T2] Bun, Installation. https://bun.com/docs/installation
- [T3] Bun, License. https://bun.com/docs/project/license

**Chrome Web Store**
- [C1] Program Policies. https://developer.chrome.com/docs/webstore/program-policies/policies (updated 2025-05-22)
- [C2] Updated Privacy Policy & Secure Handling Requirements (User Data FAQ). https://developer.chrome.com/docs/webstore/program-policies/user-data-faq (footer 2016-04-23; content references 2019 and 2021)
- [C3] Additional Requirements for Manifest V3. https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements (updated 2024-04-03)
- [C4] Extensions quality guidelines FAQ. https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq (updated 2024-07-10)
- [C5] Fill out the privacy fields. https://developer.chrome.com/docs/webstore/cws-dashboard-privacy (updated 2020-06-12)
- [C6] Troubleshooting Chrome Web Store violations. https://developer.chrome.com/docs/webstore/troubleshooting (updated 2026-07-20)
- [C7] Chrome Web Store review process. https://developer.chrome.com/docs/webstore/review-process (updated 2021-12-10)
- [C8] Provide test instructions. https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions (updated 2025-05-16)
- [C9] Branding Guidelines. https://developer.chrome.com/docs/webstore/branding (updated 2018-06-11)
- [C10] Chrome Web Store Developer Agreement. https://developer.chrome.com/docs/webstore/program-policies/terms
- [C11] Register your developer account. https://developer.chrome.com/docs/webstore/register (updated 2024-02-13)
- [C12] Trader/Non-Trader developer identification and verification. https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure
- [C13] Privacy-practices detail pages showing the category definitions, e.g. https://chromewebstore.google.com/detail/bmnlcjabgnpnenekpadlanbbkooimhnj/privacy and https://chromewebstore.google.com/detail/fkelmapobieliokjcmnilmjllacmbfjo/privacy
- [C14] "Extension removed due to Google's YouTube word trademark", chromium-extensions Google Group, April–May 2025. https://groups.google.com/a/chromium.org/g/chromium-extensions/c/-x2d1RfMmOI (read through a fetching tool; the quoted fragments are verbatim and the rest is paraphrase)

**YouTube and Google**
- [Y1] YouTube Terms of Service (US), dated 2023-12-15. https://www.youtube.com/t/terms
- [Y2] YouTube robots.txt. https://www.youtube.com/robots.txt
- [Y3] YouTube fake engagement policy. https://support.google.com/youtube/answer/3399767
- [Y4] YouTube API Services Terms of Service. https://developers.google.com/youtube/terms/api-services-terms-of-service (updated 2026-09-14)
- [Y5] YouTube API Services Developer Policies. https://developers.google.com/youtube/terms/developer-policies (updated 2026-10-15)
- [Y6] YouTube API Services Branding Guidelines. https://developers.google.com/youtube/terms/branding-guidelines (updated 2025-08-20)
- [Y7] yt-dlp wiki, Extractors (YouTube cookies and rate limits). https://github.com/yt-dlp/yt-dlp/wiki/Extractors
- [G1] Google trademark list. https://about.google/brand-resource-center/trademark-list/
- [G2] Google trademark guidelines for proper usage. https://about.google/brand-resource-center/rules/
- [G3] Google Terms of Service, effective 2026-07-30. https://policies.google.com/terms

**Precedent and name collisions**
- [P1]–[P8]: the listing links in [section 4](#4-precedent). Packages were downloaded on 2026-10-19 from AMO's file URLs (e.g. `https://addons.mozilla.org/firefox/downloads/file/5106543/multiselect_for_youtube-4.0.xpi`) and from Chrome's update endpoint (`https://clients2.google.com/service/update2/crx?response=redirect&…&x=id%3D<id>%26uc`).
- [N1] YouTube Playlist Tools (Blake Sinnett). https://chromewebstore.google.com/detail/youtube-playlist-tools/ehkkmfabomefdhfbegkiohmoiolfbjpo
- [N2] playlist.tools - YouTube Playlist Manager. https://chromewebstore.google.com/detail/pjocgpjnhgepncefgockmkglfcjmihbm
- [N3] YT Playlist Tools — Reverse, Shuffle & Reorder. https://addons.mozilla.org/en-US/firefox/addon/reverse-youtube-playlist-order/
