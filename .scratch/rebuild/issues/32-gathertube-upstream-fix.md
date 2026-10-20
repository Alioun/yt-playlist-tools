# Fix GatherTube's broken options upstream

Type: task
Status: resolved
Labels: wayfinder:task
Part of: [Rebuild (2.0)](../map.md)

## Question

The user asked to contribute back to GatherTube by fixing the options that stopped working. Find which options are broken in current Chrome and Firefox against today's YouTube, and why. Fix them minimally, in GatherTube's own style, for both its Chrome build (root) and its Firefox build (`firefox-build/`). Verify the fixes in real browsers, and prepare a pull request against `karimelgazar/gathertube`. The PR is opened from the user's GitHub account only after review. No AI attribution anywhere.

## Answer

Eleven problems in GatherTube 1.1.0 (Chrome) / 1.1.1 (Firefox, the same code AMO serves), all fixed and checked before and after in headed Chrome 156 and Firefox 158 against live YouTube, signed out.

**What's broken, and why:**

1. **Embedded Player shows "Error 153"** in both browsers. Since 2025 YouTube's embed needs an HTTP Referer, and extension pages send none. URL parameters and `referrerpolicy` don't help. This is the "configuration error" in the LibreWolf review on AMO, and it took auto-next and the rest of that mode down with it.
2. **The Firefox settings page does nothing.** `firefox-build/options.js` targets ids from an older page.
3. **The settings stats always show 0 / "Never".** Queues moved to per-window keys; the page reads the old key.
4. **"Rate Extension" (Chrome) lands on the Web Store home page.** The link has no item id.
5. **Retry throws** (`initPlayer` no longer exists) and leaves the overlay up.
6. **Queue edits are lost on reload or session restore.** The page rebuilds from `?ids=` in its URL.
7. **Drag and drop does nothing in Firefox.** The Firefox copy never got the handlers.
8. **No shortcut feedback in Firefox**, for the same reason.
9. **The English / Non-English sorts don't sort.** YouTube now auto-translates many titles, and tab titles follow, so a Japanese video counts as English.
10. **`/@handle` channel pages are gathered as a bogus video** ("Programming" from "Programming with Mosh - YouTube"), and "Close original tabs" closes them.
11. **Above 50 videos, YouTube Native silently drops the rest** and closes their tabs. `watch_videos` keeps the first 50; the fallback only checked URL length.

Everything else works: YouTube Native, the tab-order sorts, close tabs, per-window isolation, `youtu.be` / `m.` / `/live/` URLs, shuffle, play now, delete, the shortcuts, Open Queue On YouTube.

**The fixes:** one commit each, in both builds. The player page sets `Referer: https://gathertube.<extension id>` (YouTube's documented format for store apps) through a `declarativeNetRequest` session rule on its own player URLs only. That needs `declarativeNetRequestWithHostAccess`, which prompts in neither browser, and moves the player from youtube-nocookie.com to youtube.com, where GatherTube already has host access. The language sorts read original titles from oEmbed. The rest are a few lines each, in the files' own style. Suggested bump: 1.2.0.

**Where:** branch `fix/broken-options` in `/tmp/gathertube-work` (11 commits as Alioun, not pushed), the PR text in `/tmp/gathertube-work-PR.md`, and before/after logs and screenshots in `/tmp/gt-evidence/final/`.

**What this means for the 2.0 port ([ticket 31](31-gathertube.md)):**

- An embedded player in an extension page needs a Referer rule. That adds a permission to 2.0's set (`storage`, `scripting`, YouTube hosts) and sits close to the "no faked origins" line from [ticket 03](03-store-policy.md), even though it follows YouTube's own documented method. Building the queue inside YouTube instead (`watch_videos`, or the `TLPQ` queue from [ticket 29](29-youtube-queue-undo.md)) avoids both.
- `watch_videos` holds 50 videos: chunk, fall back, or add the rest another way.
- Language sorting must use original titles (oEmbed or the page's own data), never tab titles.
- Gathering must recognise video URLs positively (watch, `youtu.be`, `/live/`, perhaps `/shorts/`) rather than guess IDs from titles.
- Keep an edited queue in the URL or storage that the page actually reads back.
- One codebase for both browsers (WXT) avoids GatherTube's drift between the Chrome and Firefox copies.
