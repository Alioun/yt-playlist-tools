import "../../ui/settings/settings.css"
import { mount } from "svelte"
import { browser } from "wxt/browser"
import markSrc from "../../assets/brand/icon.svg"
import Settings from "../../ui/settings/Settings.svelte"
import { startExtensionPage } from "../../ui/shell/start"

const target = document.querySelector("#app")
if (!target) throw new Error("Missing page host")
const catalogue = () => import("../../shared/i18n/canonical").then(module => module.disclosureCatalogue)
mount(Settings, { target, props: { page: startExtensionPage(browser, navigator.platform, undefined, { catalogue }), markSrc } })
