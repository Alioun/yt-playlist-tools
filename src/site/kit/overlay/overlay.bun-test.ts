import { afterEach, expect, spyOn, test } from "bun:test"
import { Scope } from "../../core/scope"
import { createOverlayKit } from "./index"
import { settle } from "../../../../tools/fixtures/site-queue-button/harness"

const cleanups: (() => void)[] = []
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); document.body.replaceChildren(); document.documentElement.removeAttribute("dark") })
function fixture() {
  const errors: unknown[] = []
  const owner = new Scope({ document, onError: error => { errors.push(error) } })
  const kit = createOverlayKit({ owner, document, onError: error => { errors.push(error) } })
  const thumbnail = document.createElement("a")
  const card = document.createElement("div")
  card.append(thumbnail)
  document.body.append(card)
  cleanups.push(() => owner.dispose())
  return { owner, kit, thumbnail, card, errors, scope: () => { const scope = new Scope({ document, onError: error => { errors.push(error) } }); cleanups.push(() => scope.dispose()); return scope } }
}
const hosts = () => document.querySelectorAll("pp-overlay").length

test("construction is inert and two slots share one movable host", () => {
  const observer = spyOn(window.MutationObserver.prototype, "observe")
  try {
    const f = fixture()
    expect(observer).not.toHaveBeenCalled()
    expect(hosts()).toBe(0)
    const queue = f.kit.use(f.scope(), "queue")
    const reserved = f.kit.use(f.scope(), "quick-save")
    expect(f.kit.use(f.scope(), "queue")).toBeNull()
    expect(hosts()).toBe(0)
    queue?.place({ kind: "thumbnail", link: f.thumbnail })
    expect(hosts()).toBe(1)
    expect(f.kit.readHost()?.previousElementSibling).toBe(f.thumbnail)
    expect(reserved?.slot.hidden).toBe(true)
    const order = [...(f.kit.readHost()?.shadowRoot?.querySelectorAll("[data-slot]") ?? [])].map(slot => slot.getAttribute("data-slot"))
    expect(order).toEqual(["queue", "quick-save"])
    expect(observer).toHaveBeenCalled()
  } finally { observer.mockRestore() }
})

test("releasing every lease leaves zero hosts and a later lease starts fresh", () => {
  const f = fixture()
  const first = f.scope()
  f.kit.use(first, "queue")?.place({ kind: "thumbnail", link: f.thumbnail })
  const host = f.kit.readHost()
  first.dispose()
  expect(hosts()).toBe(0)
  expect(f.kit.readHost()).toBeNull()
  f.kit.use(f.scope(), "queue")?.place({ kind: "thumbnail", link: f.thumbnail })
  expect(f.kit.readHost()).not.toBe(host)
  expect(hosts()).toBe(1)
  f.owner.dispose()
  expect(hosts()).toBe(0)
})

test("the host mirrors YouTube's dark attribute and isolates its own clicks", async () => {
  const f = fixture()
  const lease = f.kit.use(f.scope(), "queue")
  const button = document.createElement("button")
  lease?.slot.append(button)
  lease?.place({ kind: "thumbnail", link: f.thumbnail })
  document.documentElement.setAttribute("dark", "")
  await settle()
  expect(f.kit.readHost()?.hasAttribute("dark")).toBe(true)
  let clicks = 0
  f.card.addEventListener("click", () => { clicks++ })
  button.click()
  f.thumbnail.click()
  expect(clicks).toBe(1)
})

test("Quick-save alone follows a delayed wrapped preview and returns when it hides", async () => {
  const f = fixture()
  const quickSave = f.kit.use(f.scope(), "quick-save")
  Object.defineProperty(f.thumbnail, "getBoundingClientRect", { value: () => ({ left: 100, top: 100, width: 320, height: 180 }) })
  quickSave?.place({ kind: "thumbnail", link: f.thumbnail })
  const app = document.createElement("ytd-app")
  const slot = document.createElement("div"); slot.id = "video-preview"
  const wrapper = document.createElement("div"); wrapper.className = "ytdVideoPreviewLoaderVideoPreviewContainer"
  const preview = document.createElement("ytd-video-preview")
  preview.style.padding = "12px"
  Object.defineProperty(preview, "getBoundingClientRect", { value: () => ({ left: 90, top: 90, right: 450, bottom: 310, width: 360, height: 220 }) })
  wrapper.append(preview); slot.append(wrapper); app.append(slot); document.body.append(app)
  await settle()
  expect(f.kit.readHost()?.parentElement).toBe(preview)
  expect(f.kit.readHost()?.style.top).toBe("16px")
  expect(f.kit.readHost()?.style.left).toBe("16px")
  const queue = f.kit.use(f.scope(), "queue")
  queue?.place({ kind: "thumbnail", link: f.thumbnail })
  quickSave?.place({ kind: "thumbnail", link: f.thumbnail })
  expect(f.kit.readHost()?.parentElement).toBe(preview)
  preview.hidden = true
  await settle()
  expect(f.kit.readHost()?.previousElementSibling).toBe(f.thumbnail)
  expect(f.errors).toEqual([])
})
