// P2 marker, registered at runtime with scripting.registerContentScripts
// (isolated world, persistAcrossSessions). It only stamps the page.
document.documentElement.dataset.ytptRegIsolated = String(Date.now())
