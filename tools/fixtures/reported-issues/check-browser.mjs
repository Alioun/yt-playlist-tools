import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, resolve, extname } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "vite"
import { chromium } from "playwright"

const fixture = dirname(fileURLToPath(import.meta.url))
const evidence = process.argv[2] ? resolve(process.argv[2]) : await mkdtemp(resolve(tmpdir(), "perchling-reported-issues-"))
const output = resolve(evidence, "build")
await mkdir(evidence, { recursive: true })
await build({ root: fixture, configFile: resolve(fixture, "vite.config.ts"), logLevel: "error", build: { outDir: output, emptyOutDir: true } })
const browser = await chromium.launch({ headless: true })
const results = []
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 360, height: 760 }, reducedMotion: "reduce" })
    await context.route("**/*", async route => {
      const url = new URL(route.request().url())
      if (url.origin !== "https://perchling.test") return route.abort()
      const path = resolve(output, "." + (url.pathname === "/" ? "/index.html" : url.pathname))
      if (!path.startsWith(output + "/")) return route.abort()
      try {
        await route.fulfill({ body: await readFile(path), contentType: types[extname(path)] ?? "application/octet-stream" })
      } catch {
        await route.fulfill({ status: 404, body: "Missing fixture asset" })
      }
    })
    const page = await context.newPage()
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    for (const root of [10, 16]) {
      await page.goto(`https://perchling.test/?view=picker&theme=${theme}&root=${root}`)
      const panel = page.locator("pp-picker .picker-panel")
      await panel.waitFor()
      const sizes = await panel.evaluate(node => {
        const css = target => getComputedStyle(target)
        const title = node.querySelector(".row-title"),
          close = node.querySelector(".heading-row button"),
          toggle = node.querySelector("[role='switch']")
        return {
          title: css(title).fontSize,
          font: css(node).fontFamily,
          background: css(node).backgroundColor,
          close: close.getBoundingClientRect().width,
          switchWidth: toggle.getBoundingClientRect().width,
          switchHeight: toggle.getBoundingClientRect().height,
          width: node.getBoundingClientRect().width
        }
      })
      assert.equal(sizes.title, "14px", "YouTube's 10px root must not shrink the picker")
      assert.equal(sizes.switchWidth, 38)
      assert.equal(sizes.switchHeight, 22)
      assert(sizes.close >= 28 && sizes.close <= 40, "Close button must have its utility styling")
      assert(sizes.font.includes("Segoe UI"), "Picker must use the extension font")
      assert.notEqual(sizes.background, "rgba(0, 0, 0, 0)")
      assert(sizes.width <= 336)
      await page.getByRole("searchbox").fill("Beta")
      assert.equal(await page.locator("[data-picker-row]").count(), 1)
      await page.screenshot({ path: resolve(evidence, `picker-${theme}-${root}.png`) })
      results.push({ view: "picker", theme, root, ...sizes })
    }
    for (const width of [360, 1024]) {
      await page.setViewportSize({ width, height: 760 })
      await page.goto(`https://perchling.test/?view=onboarding&theme=${theme}`)
      await page.getByRole("checkbox").first().waitFor()
      await page.locator("[data-feature-preview]").last().waitFor()
      assert.equal(await page.getByRole("checkbox").count(), 11)
      assert.equal(await page.locator("[data-feature-preview]").count(), 11)
      assert(await page.getByRole("checkbox").evaluateAll(nodes => nodes.every(node => node.getAttribute("aria-checked") === "false")))
      assert(await page.locator("[data-feature-preview]").evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height > 100)), "Examples must be visible before enabling features")
      await page.locator("[data-feature-preview='quick-save']").click()
      assert.equal(await page.getByRole("checkbox", { name: "Quick-save on thumbnails", exact: true }).getAttribute("aria-checked"), "true")
      assert.equal(await page.getByRole("checkbox", { name: "Queue button on thumbnails", exact: true }).getAttribute("aria-checked"), "false")
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Onboarding must fit narrow screens")
      await page.locator("[data-feature-preview='quick-save']").screenshot({ path: resolve(evidence, `onboarding-${theme}-${width}.png`) })
      results.push({ view: "onboarding", theme, width, examples: 11 })
    }
    // The popup is 360 px wide, so the account's name and @handle rarely both fit in its header.
    await page.setViewportSize({ width: 360, height: 600 })
    // With two setups the account is the menu button of which setup to show, which also holds a chevron.
    for (const [name, handle, setups] of [
      ["Alex Doe", "@alexdoe", 1],
      ["Alex Doe", "@alexdoe", 2],
      ["Alexandria Montgomery-Fairweather", "@alexandriamontgomery", 1],
      ["Alexandria Montgomery-Fairweather", "@alexandriamontgomery", 2]
    ]) {
      await page.goto(`https://perchling.test/?view=popup&theme=${theme}&setups=${setups}&name=${encodeURIComponent(name)}&handle=${encodeURIComponent(handle)}`)
      await page.locator("header").getByText(name, { exact: true }).waitFor()
      assert.equal(await page.getByRole("button", { name: "Show the setup for" }).count(), setups - 1)
      const header = await page.locator("header").evaluate(
        (node, [name, handle]) => {
          const texts = [...node.querySelectorAll("span")].filter(span => span.childElementCount === 0)
          const nameBox = texts.find(span => span.textContent === name),
            handleBox = texts.find(span => span.textContent === handle)
          const cut = box => box.scrollWidth > box.clientWidth
          const settings = [...node.querySelectorAll("button")].at(-1).getBoundingClientRect()
          return {
            nameCut: cut(nameBox),
            nameWidth: nameBox.getBoundingClientRect().width,
            handleCut: cut(handleBox),
            handleWidth: handleBox.getBoundingClientRect().width,
            tooltip: nameBox.closest("[title]")?.getAttribute("title") ?? null,
            iconWidth: node.querySelector("span svg").getBoundingClientRect().width,
            settingsRight: settings.right,
            fits: document.documentElement.scrollWidth <= innerWidth
          }
        },
        [name, handle]
      )
      assert.equal(header.tooltip, `${name} ${handle}`, "The header's tooltip must give the name and the @handle in full")
      assert(header.fits && header.settingsRight <= 360, "The header must fit the popup's 360 px")
      assert.equal(header.iconWidth, 16, "The account's icon must keep its size beside a long name")
      if (name === "Alex Doe") assert(!header.nameCut, "A short name must show whole; the @handle is the part that gives way")
      else assert(header.nameCut && header.handleWidth < 1, "A name too long for the header is cut only after the @handle has given all its room")
      await page.locator("header").screenshot({ path: resolve(evidence, `popup-header-${theme}-${name === "Alex Doe" ? "short" : "long"}-${setups}.png`) })
      results.push({ view: "popup-header", theme, name, handle, setups, ...header })
    }
    assert.deepEqual(errors, [])
    await context.close()
  }
} finally {
  await browser.close()
}
await writeFile(resolve(evidence, "results.json"), JSON.stringify(results, null, 2) + "\n")
process.stdout.write(`Verified isolated picker sizing, styling, search, all onboarding examples, and the popup header's account: ${evidence}\n`)
