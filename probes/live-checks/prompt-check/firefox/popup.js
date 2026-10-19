const api = globalThis.browser ?? globalThis.chrome
const ORIGINS = { origins: ["*://*.youtube.com/*"] }
const show = async (note = "") => {
  const all = await api.permissions.getAll()
  const has = await api.permissions.contains(ORIGINS)
  document.getElementById("state").textContent = `${note}\nyoutube.com access granted: ${has}\npermissions: ${all.permissions.join(", ")}\norigins: ${all.origins.join(", ")}`
}
// The request must be the click's first call, so it keeps the user gesture.
document.getElementById("request").addEventListener("click", () => {
  api.permissions.request(ORIGINS).then((ok) => show(`granted: ${ok}`), (e) => show(`error: ${e?.message ?? e}`))
})
show()
