// THROWAWAY PROTOTYPE (ticket 14). A stand-in for ticket 17's Registrar: two runtime registrations for youtube.com,
// the gateway in the page world and an ordered isolated list (core → kit → features in registry order), plus
// popovers.js injected on demand. No manifest content_scripts and no web-accessible resources.
const MATCHES = ["https://www.youtube.com/*"];
const ISOLATED = [
  "core-www.js",
  "kit-www.js",
  "feature-shortcuts-www.js",
  "feature-quick-save.js",
  "feature-queue-button.js",
  "feature-watch-button.js",
  "feature-card-menu.js",
];

async function register() {
  const existing = await chrome.scripting.getRegisteredContentScripts();
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  await chrome.scripting.registerContentScripts([
    { id: "pp-www-page", world: "MAIN", js: ["page-www.js"], matches: MATCHES, runAt: "document_start", persistAcrossSessions: true },
    { id: "pp-www", world: "ISOLATED", js: ISOLATED, matches: MATCHES, runAt: "document_idle", persistAcrossSessions: true },
  ] as chrome.scripting.RegisteredContentScript[]);
}

chrome.runtime.onInstalled.addListener(() => void register());
chrome.runtime.onStartup.addListener(() => void register());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "tab.need" && msg.popovers && sender.tab?.id !== undefined) {
    chrome.scripting
      .executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] }, files: ["popovers.js"] })
      .then(() => sendResponse({ ok: true }), (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "registered") {
    chrome.scripting.getRegisteredContentScripts().then(sendResponse);
    return true;
  }
});
