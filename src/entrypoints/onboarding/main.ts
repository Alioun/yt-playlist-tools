import "../../ui/onboarding/onboarding.css"
import { mount } from "svelte"
import { browser } from "wxt/browser"
import markSrc from "../../assets/brand/icon.svg"
import catalogue from "../../public/_locales/en/messages.json"
import { FirstRun } from "../../ui/onboarding"
import { startFirstRun } from "../../ui/onboarding/start"
import { startExtensionPage } from "../../ui/shell/start"

const target = document.querySelector("#first-run")
if (!target) throw new Error("Missing first-run host")
mount(FirstRun, { target, props: { ...startFirstRun(startExtensionPage(browser, catalogue, navigator.platform)), markSrc } })
