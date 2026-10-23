import assert from "node:assert/strict"
import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const targets = ["chrome-mv3", "firefox-mv3"]
const browser = await chromium.launch()
try {
  for (const target of targets) {
    const directory = new URL(`./.output/${target}/`, import.meta.url)
    const server = createServer(async (request, response) => {
      const path = new URL(request.url, "http://localhost").pathname
      if (!/^\/(pilot\.html|chunks\/[\w.-]+\.js)$/.test(path)) {
        response.writeHead(404).end()
        return
      }
      try {
        const body = await readFile(new URL(`.${path}`, directory))
        response.setHeader("Content-Type", path.endsWith(".js") ? "text/javascript" : "text/html")
        response.end(body)
      } catch {
        response.writeHead(404).end()
      }
    })
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert(address && typeof address === "object")
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      const errors = []
      page.on("pageerror", (error) => errors.push(error.message))
      await page.goto(`http://127.0.0.1:${address.port}/pilot.html`)
      await page.getByRole("button", { name: "Count 0" }).click()
      await page.getByRole("button", { name: "Count 1" }).waitFor()
      await page.getByRole("button", { name: "Open pilot popover" }).click()
      const content = page.getByText("Svelte pilot popover", { exact: true })
      await content.waitFor({ state: "visible" })
      await page.waitForFunction(() => {
        const root = document.querySelector("#pilot-host").shadowRoot
        const popover = root.querySelector(".pilot-popover")
        return popover && getComputedStyle(popover).visibility === "visible"
      })
      const result = await page.evaluate(() => {
        const root = document.querySelector("#pilot-host").shadowRoot
        const counter = root.querySelector(".counter")
        const trigger = root.querySelector("[data-popover-trigger]")
        const popover = root.querySelector(".pilot-popover")
        const triggerRect = trigger.getBoundingClientRect()
        const popoverRect = popover.getBoundingClientRect()
        return {
          counterColor: getComputedStyle(counter).color,
          popoverBackground: getComputedStyle(popover).backgroundColor,
          position: getComputedStyle(popover.closest("[data-bits-floating-content-wrapper]")).position,
          styleInShadow: !!root.querySelector("style"),
          lightDomPopover: !!document.querySelector(".pilot-popover"),
          triggerRect: { x: triggerRect.x, y: triggerRect.y, width: triggerRect.width, height: triggerRect.height },
          popoverRect: { x: popoverRect.x, y: popoverRect.y, width: popoverRect.width, height: popoverRect.height }
        }
      })
      assert.equal(result.counterColor, "rgb(20, 80, 140)")
      assert.equal(result.popoverBackground, "rgb(240, 245, 250)")
      assert.equal(result.position, "fixed")
      assert(result.styleInShadow)
      assert(!result.lightDomPopover)
      assert(result.triggerRect.width > 0 && result.triggerRect.height > 0)
      assert(result.popoverRect.width > 0 && result.popoverRect.height > 0)
      assert(Math.abs(result.popoverRect.y - result.triggerRect.y - result.triggerRect.height - 8) <= 1)
      await page.screenshot({ path: fileURLToPath(new URL(`./.output/${target}/browser-check.png`, import.meta.url)) })
      await page.keyboard.press("Escape")
      await content.waitFor({ state: "hidden" })
      assert.equal(await page.getByRole("button", { name: "Open pilot popover" }).getAttribute("aria-expanded"), "false")
      assert.equal(await page.getByRole("button", { name: "Open pilot popover" }).evaluate((element) => element.getRootNode().activeElement === element), true)
      assert.deepEqual(errors, [])
      console.log(`${target}: Chromium ${browser.version()} passed counter, shadow styles, popover positioning, Escape dismissal, and focus restoration`)
      console.log(JSON.stringify(result))
    } finally {
      await context.close()
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
    }
  }
} finally {
  await browser.close()
}
