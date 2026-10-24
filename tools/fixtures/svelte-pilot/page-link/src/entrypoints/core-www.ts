import { defineUnlistedScript } from "wxt/utils/define-unlisted-script"
export default defineUnlistedScript(() => {
  Object.assign(globalThis, { __pp: {
    core: { marker: "preserved", trace: ["core"], mainAtCore: document.documentElement.dataset.mainRan, readyStateAtCore: document.readyState }
  } })
})
