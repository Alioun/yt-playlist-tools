import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
export default defineUnlistedScript(() => {
  document.documentElement.dataset.mainCannotRead = String(typeof globalThis.__pp === "undefined")
  document.documentElement.dataset.mainRan = "true"
  document.documentElement.dataset.mainReadyState = document.readyState
})
