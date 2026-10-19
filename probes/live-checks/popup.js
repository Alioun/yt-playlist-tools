const api = globalThis.browser ?? globalThis.chrome
const WILDCARD = { origins: ["*://*.youtube.com/*"] }
const out = (id, text) => (document.getElementById(id).textContent = text)

// The request must be the first thing the click does, so it keeps the gesture.
document.getElementById("request").addEventListener("click", () => {
  api.permissions.request(WILDCARD).then(
    (granted) => out("result", `Granted: ${granted}`),
    (e) => out("result", `Error: ${e?.message ?? e}`)
  )
})
document.getElementById("remove").addEventListener("click", () => {
  api.permissions.remove(WILDCARD).then(
    (removed) => out("result", `Removed: ${removed}`),
    (e) => out("result", `Error: ${e?.message ?? e}`)
  )
})

;(async () => {
  try {
    const win = await api.windows.getCurrent()
    const [tab] = await api.tabs.query({ active: true, currentWindow: true })
    const tabHost = tab?.url ? new URL(tab.url).host : null
    await api.storage.local.set({ lastPopup: { at: Date.now(), windowId: win.id, windowType: win.type, tabId: tab?.id, tabHost } })
    out("where", `This window is "${win.type}"; the active tab is ${tabHost ?? "not readable (not a YouTube tab?)"}.`)
  } catch (e) {
    out("where", `Error: ${e?.message ?? e}`)
  }
})()
