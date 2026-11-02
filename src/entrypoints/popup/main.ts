import "../../ui/popup/popup.css"
import { mount } from "svelte"
import { browser } from "wxt/browser"
import markSrc from "../../assets/brand/icon.svg"
import Popup from "../../ui/popup/Popup.svelte"
import { startExtensionPage } from "../../ui/shell/start"

const target = document.querySelector("#app")
if (!target) throw new Error("Missing page host")
// The popup names its window to the background, because it has no sender tab (ARC-MSG-06).
const window = await browser.windows.getCurrent()
const catalogue = () => import("../../shared/i18n/canonical").then(module => module.disclosureCatalogue)
mount(Popup, { target, props: { page: startExtensionPage(browser, navigator.platform, undefined, { windowId: window.id, catalogue }), markSrc } })
