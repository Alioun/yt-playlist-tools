import { afterEach, expect, test } from "bun:test"
import { createLiveWwwQueue } from "./live-www-queue"
import { createWwwResolver } from "./www-resolver"

afterEach(() => document.body.replaceChildren())

test("the miniplayer reads as active once YouTube marks the app, as it does after a first queue add", () => {
  const app = document.createElement("ytd-app")
  app.append(document.createElement("ytd-miniplayer"))
  document.body.append(app)
  const queue = createLiveWwwQueue({ window, document, resolver: createWwwResolver(window) })
  expect(queue.miniplayer()).toBe(false)
  app.setAttribute("miniplayer-is-active", "")
  expect(queue.miniplayer()).toBe(true)
})
