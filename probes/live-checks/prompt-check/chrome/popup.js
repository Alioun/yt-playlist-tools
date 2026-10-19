const api = globalThis.browser ?? globalThis.chrome
const ORIGINS = { origins: ["https://music.youtube.com/*"] }
const show = async (note = "") => {
  const all = await api.permissions.getAll()
  document.getElementById("state").textContent = `${note}\npermissions: ${all.permissions.join(", ")}\norigins: ${all.origins.join(", ")}`
}
// The request must be the click's first call, so it keeps the user gesture.
document.getElementById("request").addEventListener("click", () => {
  api.permissions.request(ORIGINS).then((ok) => show(`granted: ${ok}`), (e) => show(`error: ${e?.message ?? e}`))
})
document.getElementById("remove").addEventListener("click", () => {
  api.permissions.remove(ORIGINS).then((ok) => show(`removed: ${ok}`), (e) => show(`error: ${e?.message ?? e}`))
})
show()
