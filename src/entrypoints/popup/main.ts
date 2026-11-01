import "../../ui/shell/shell.css"
import { mount } from "svelte"
import { browser } from "wxt/browser"
import markSrc from "../../assets/brand/icon.svg"
import PageShell from "../../ui/shell/PageShell.svelte"
import { startExtensionPage } from "../../ui/shell/start"

const target = document.querySelector("#app")
if (!target) throw new Error("Missing page host")
mount(PageShell, { target, props: { page: startExtensionPage(browser, navigator.platform), markSrc, kind: "popup" } })
