import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { enableCardMenu, findMenuButton } from "@/lib/card-menu"

const OPTIONS = {
  cardSelectors: ["ytd-rich-item-renderer", "yt-lockup-view-model"],
  excludeSelectors: ["ytm-shorts-lockup-view-model"]
}

function legacyCard() {
  document.body.innerHTML = `
    <ytd-rich-item-renderer>
      <a id="thumb" href="/watch?v=abc">thumb</a>
      <ytd-menu-renderer><yt-icon-button id="button"><button id="menu">⋮</button></yt-icon-button></ytd-menu-renderer>
    </ytd-rich-item-renderer>`
  return document.getElementById("menu") as HTMLButtonElement
}

function rightClick(target: Element, init: MouseEventInit = {}) {
  const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(event)
  return event
}

let stop: () => void = () => {}
beforeEach(() => {
  document.body.innerHTML = ""
})
afterEach(() => stop())

describe("findMenuButton", () => {
  it("finds the ⋮ button on legacy renderers", () => {
    const menu = legacyCard()
    expect(findMenuButton(document.querySelector("ytd-rich-item-renderer")!)).toBe(menu)
  })

  it("finds the ⋮ button on lockup cards", () => {
    document.body.innerHTML = `
      <yt-lockup-view-model><div class="yt-lockup-metadata-view-model__menu-button"><button id="m">⋮</button></div></yt-lockup-view-model>`
    expect(findMenuButton(document.querySelector("yt-lockup-view-model")!)?.id).toBe("m")
  })
})

describe("enableCardMenu", () => {
  it("opens YouTube's menu instead of the browser's", () => {
    const menu = legacyCard()
    const click = vi.fn()
    menu.addEventListener("click", click)
    stop = enableCardMenu(OPTIONS)

    const event = rightClick(document.getElementById("thumb")!)

    expect(click).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it("leaves Shift+right-click to the browser", () => {
    const menu = legacyCard()
    const click = vi.fn()
    menu.addEventListener("click", click)
    stop = enableCardMenu(OPTIONS)

    const event = rightClick(document.getElementById("thumb")!, { shiftKey: true })

    expect(click).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it("does not swallow the click when no ⋮ button exists", () => {
    // If YouTube changes its markup, the native menu must keep working.
    document.body.innerHTML = `<ytd-rich-item-renderer><a id="t">x</a></ytd-rich-item-renderer>`
    stop = enableCardMenu(OPTIONS)
    expect(rightClick(document.getElementById("t")!).defaultPrevented).toBe(false)
  })

  it("ignores right-clicks outside cards and on excluded cards", () => {
    document.body.innerHTML = `
      <p id="out">elsewhere</p>
      <yt-lockup-view-model><ytm-shorts-lockup-view-model id="s"></ytm-shorts-lockup-view-model>
        <div class="yt-lockup-metadata-view-model__menu-button"><button>⋮</button></div></yt-lockup-view-model>`
    stop = enableCardMenu(OPTIONS)
    expect(rightClick(document.getElementById("out")!).defaultPrevented).toBe(false)
    expect(rightClick(document.getElementById("s")!).defaultPrevented).toBe(false)
  })

  it("stops intercepting once stopped", () => {
    legacyCard()
    enableCardMenu(OPTIONS)()
    expect(rightClick(document.getElementById("thumb")!).defaultPrevented).toBe(false)
  })
})
