import { mount } from "svelte"
import { createIsolatedElement } from "@webext-core/isolated-element"
import FirstRun from "../../../src/ui/onboarding/FirstRun.svelte"
import { pagePicker } from "../../../src/ui/picker/page"
import { englishFirstRunText, englishI18n } from "../localization/scripted"
import { makePicker } from "../picker-ui/scenarios"
import { syntheticOwner } from "../ui-foundation/synthetic-owner"

const params = new URLSearchParams(location.search)
const dark = params.get("theme") === "dark"
document.documentElement.classList.toggle("dark", dark)
const target = document.getElementById("app")
if (!target) throw Error("Missing fixture host")
if (params.get("view") === "picker") {
  document.documentElement.style.fontSize = `${params.get("root") === "16" ? 16 : 10}px`
  const { parentElement: host, isolatedElement, shadow } = await createIsolatedElement({ name: "pp-picker", mode: "open", isolateEvents: true })
  host.style.cssText = "all: initial; position: fixed; left: 12px; top: 12px;"
  host.toggleAttribute("dark", dark)
  const style = document.createElement("style")
  style.textContent = pagePicker.css
  shadow.prepend(style)
  const frame = document.createElement("div")
  frame.className = dark ? "dark" : ""
  frame.style.cssText = "width: 320px; max-height: calc(100vh - 24px); display: flex; flex-direction: column;"
  isolatedElement.append(frame)
  target.append(host)
  const picker = makePicker("save", "")
  pagePicker.mount(frame, {
    picker,
    purpose: "save",
    i18n: englishI18n(),
    os: "windows",
    onoutcome() {},
    onrequestclose() {
      host.remove()
      picker.close()
    }
  })
} else {
  await import("../../../src/ui/onboarding/onboarding.css")
  mount(FirstRun, { target, props: { owner: syntheticOwner("fresh", "firefox"), text: englishFirstRunText(), markSrc: "" } })
}
