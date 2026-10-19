// THROWAWAY PROTOTYPE (ticket 27, rough dev build). The background registers the page scripts at runtime (ticket
// 17's D3: pp-music-page in MAIN, pp-music as an ordered isolated list), never as manifest content scripts, and
// injects the lazy popovers on request.
declare const chrome: any;

const MATCHES = ["https://music.youtube.com/*"];
const SCRIPTS = [
  { id: "pp-music-page", matches: MATCHES, js: ["page-music.js"], runAt: "document_start", world: "MAIN", allFrames: false, persistAcrossSessions: true },
  { id: "pp-music", matches: MATCHES, js: ["core-music.js", "kit-music.js", "feature-music-actions.js"], runAt: "document_idle", allFrames: false, persistAcrossSessions: true },
];

async function register() {
  const have: { id: string }[] = await chrome.scripting.getRegisteredContentScripts();
  const ids = have.map((s) => s.id);
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids });
  await chrome.scripting.registerContentScripts(SCRIPTS);
  await chrome.storage.session.set({ registered: Date.now() });
}

chrome.runtime.onInstalled.addListener(() => void register());
chrome.runtime.onStartup.addListener(() => void register());

chrome.runtime.onMessage.addListener((msg: any, sender: any, reply: (r: unknown) => void) => {
  if (msg?.type === "pp27:popovers" && sender.tab?.id !== undefined) {
    chrome.scripting
      .executeScript({ target: { tabId: sender.tab.id, frameIds: [sender.frameId ?? 0] }, files: ["popovers.js"] })
      .then(() => reply({ ok: true }), (e: Error) => reply({ ok: false, error: String(e) }));
    return true;
  }
});
