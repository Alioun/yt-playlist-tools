import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { resolve, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, firefox } from "playwright"

const [engine, theme, mode, evidence] = process.argv.slice(2)
assert(engine === "chromium" || engine === "firefox", "E_BROWSER_ENGINE")
assert(theme === "light" || theme === "dark", "E_THEME")
assert(mode === "render" || mode === "axe", "E_BROWSER_MODE")
assert(evidence, "E_EVIDENCE_PATH")
const matrix = JSON.parse(await readFile(new URL("./render-matrix.json", import.meta.url), "utf8"))
const root = fileURLToPath(new URL(`./.output/${engine === "firefox" ? "firefox-mv3" : "chrome-mv3"}/`, import.meta.url))
await mkdir(evidence, { recursive: true })
let axeSource = null
if (mode === "axe") {
  const require = createRequire(import.meta.url)
  // Resolution failure is a missing gate. No installer or download is attempted.
  axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8")
}
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" }
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname
  const target = resolve(root, "." + pathname)
  const type = types[pathname.slice(pathname.lastIndexOf("."))]
  if (!type || relative(root, target).startsWith("..")) return void response.writeHead(404).end()
  try {
    response.setHeader("Content-Type", type)
    response.end(await readFile(target))
  } catch { response.writeHead(404).end() }
})
let browser
let listening = false
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => { listening = true; resolve() })
  })
  const address = server.address()
  assert(address && typeof address === "object", "E_LOOPBACK_ADDRESS")
  const origin = `http://127.0.0.1:${address.port}`
  browser = await (engine === "firefox" ? firefox : chromium).launch(engine === "chromium" ? { chromiumSandbox: true } : {})
  for (const width of matrix.widths) {
    const context = await browser.newContext({ viewport: { width, height: matrix.height }, colorScheme: theme, reducedMotion: matrix.reducedMotion })
    try {
      await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
      const page = await context.newPage()
      const errors = []
      page.on("pageerror", error => errors.push(error.message))
      for (const scenario of matrix.scenarios) {
        errors.length = 0
        await page.goto(`${origin}/picker.html?scenario=${scenario}&theme=${theme}`)
        await page.getByRole("heading", { name: "Synthetic picker fixture" }).waitFor()
        const trigger = page.getByRole("button", { name: "Gather playlist: Synthetic current playlist", exact: true })
        if (scenario === "chooser") await trigger.click()
        if (scenario === "empty-search") await page.getByText("No playlists match your search.").waitFor()
        else if (scenario === "empty-list") await page.getByText("No playlists to show.").waitFor()
        else if (scenario === "failed-list") await page.getByText("Playlist data is unavailable. Refresh playlists to try again.").waitFor()
        else await page.getByRole("checkbox").first().waitFor()
        const search = page.getByRole("searchbox")
        assert(await search.evaluate(node => node === document.activeElement), "Search must receive focus on open")
        if (scenario === "create-validation" || scenario === "create-failure") {
          await page.getByRole("button", { name: "New playlist", exact: true }).click()
          const title = page.getByRole("textbox", { name: "Title", exact: true })
          if (scenario === "create-validation") {
            await title.blur()
            await page.getByText("Titles can't contain < or >", { exact: true }).waitFor()
          } else {
            await title.fill("Synthetic failure title")
            await page.getByRole("button", { name: "Create", exact: true }).click()
            await page.getByText("YouTube won't create more playlists right now. Try again in a few minutes.", { exact: true }).waitFor()
            assert.equal(await title.inputValue(), "Synthetic failure title")
          }
        }
        if (scenario === "choice-refusal") {
          await page.getByRole("checkbox", { name: "Synthetic Alpha", exact: true }).click()
          await page.getByText("This choice wasn't saved because browser sync is full.", { exact: true }).waitFor()
          assert.equal(await page.getByRole("checkbox", { name: "Synthetic Beta", exact: true }).getAttribute("aria-checked"), "true")
        }
        if (scenario === "sort-refusal") {
          await page.getByRole("switch", { name: "Sort A–Z" }).click()
          await page.getByText("The sort order wasn't saved. The previous order is shown.", { exact: true }).waitFor()
        }
        if (scenario === "no-tab") assert(await page.getByRole("button", { name: "Refresh playlists" }).isDisabled())
        if (scenario === "keyboard") {
          await search.press("ArrowDown")
          await page.keyboard.press("End")
          const last = page.getByRole("checkbox").last()
          assert(await last.evaluate(node => node === document.activeElement))
          await page.keyboard.press("Home")
          await page.keyboard.press("Enter")
          await page.waitForFunction(() => document.querySelector("button[data-picker-row]")?.getAttribute("aria-checked") === "true")
        }
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          dark: document.documentElement.classList.contains("dark"),
          popover: [...document.querySelectorAll(".chooser-popover")].map(node => {
            const rect = node.getBoundingClientRect()
            return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width }
          }),
          moving: document.getAnimations().filter(animation => {
            const effect = animation.effect
            return effect instanceof KeyframeEffect && effect.getKeyframes().some(frame => Object.keys(frame).some(key => ["transform", "translate", "rotate", "scale"].includes(key)))
          }).length
        }))
        assert(layout.overflow <= 1, "E_HORIZONTAL_OVERFLOW")
        assert.equal(layout.dark, theme === "dark")
        assert.equal(layout.moving, 0, "E_REDUCED_MOTION")
        for (const rect of layout.popover) assert(rect.width > 0 && rect.left >= 0 && rect.right <= width + 1 && rect.top >= 0 && rect.bottom <= matrix.height + 1, "E_POPOVER_CONSTRAINT")
        if (mode === "axe") {
          await page.addScriptTag({ content: axeSource })
          const result = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }))
          await writeFile(resolve(evidence, `${scenario}-${width}.axe.json`), JSON.stringify(result, null, 2) + "\n")
          assert.equal(result.violations.length, 0, "E_AXE_VIOLATIONS")
        } else {
          await page.screenshot({ path: resolve(evidence, `${scenario}-${width}.png`), fullPage: true })
        }
        if (scenario === "chooser") {
          await search.press("Escape")
          await page.getByRole("searchbox").waitFor({ state: "hidden" })
          assert(await trigger.evaluate(node => node === document.activeElement), "E_CHOOSER_FOCUS_RETURN")
          await trigger.click()
          await page.getByRole("searchbox").waitFor()
          assert.equal(await page.getByRole("checkbox", { name: "Synthetic Beta", exact: true }).getAttribute("aria-checked"), "true")
          await page.keyboard.press("Escape")
        }
        assert.deepEqual(errors, [], "E_PAGE_ERROR")
        await writeFile(resolve(evidence, `${scenario}-${width}.layout.json`), JSON.stringify({ synthetic: true, engine, theme, scenario, width, layout }, null, 2) + "\n")
      }
    } finally { await context.close() }
  }
} finally {
  await browser?.close()
  if (listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}
