import "../../ui/popup/popup.css"
import { mount } from "svelte"
import { browser } from "wxt/browser"
import markSrc from "../../assets/brand/icon.svg"
import Popup from "../../ui/popup/Popup.svelte"
import { startExtensionPage } from "../../ui/shell/start"

const target = document.querySelector("#app")
if (!target) throw new Error("Missing page host")
const catalogue = () => import("../../shared/i18n/canonical").then(module => module.disclosureCatalogue)
// The popup names its window to the background, because it has no sender tab (ARC-MSG-06). No top-level await:
// the first view shares this chunk, and a lazy chunk importing an entry that awaits leaves the popup blank (Q-PERF-35 rule 3).
void browser.windows.getCurrent().then(window => {
  mount(Popup, { target, props: { page: startExtensionPage(browser, navigator.platform, undefined, { windowId: window.id, catalogue }), markSrc } })
})
