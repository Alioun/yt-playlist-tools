// P2 marker, registered at runtime with scripting.registerContentScripts
// (world MAIN, persistAcrossSessions). It only stamps the page.
document.documentElement.dataset.ytptRegMain = String(Date.now())
