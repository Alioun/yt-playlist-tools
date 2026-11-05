import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdir, readFile } from "node:fs/promises"
import { chromium, firefox } from "playwright"

const engines = { chromium, firefox }
const engine = process.argv[2] ?? "chromium"
assert(engine in engines, "usage: node check-browser.mjs [chromium|firefox]")
const target = engine === "firefox" ? "firefox-mv3" : "chrome-mv3"
const directory = new URL(`./.output/${target}/`, import.meta.url)
const screens = new URL(`./.output/screens/${engine}/`, import.meta.url)
await mkdir(screens, { recursive: true })
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" }
const server = createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname
  const type = types[path.slice(path.lastIndexOf("."))]
  if (!type || path.includes("..")) return void response.writeHead(404).end()
  try {
    const body = await readFile(new URL(`.${path}`, directory))
    response.setHeader("Content-Type", type)
    response.end(body)
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((resolve, reject) => {
  server.once("error", reject)
  server.listen(0, "127.0.0.1", () => {
    server.off("error", reject)
    resolve()
  })
})
const address = server.address()
assert(address && typeof address === "object")
const origin = `http://127.0.0.1:${address.port}`
let browser
try {
  browser = await engines[engine].launch(engine === "chromium" ? { chromiumSandbox: true } : {})
  for (const colorScheme of ["light", "dark"]) {
    for (const width of [360, 700, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme, reducedMotion: "reduce" })
      try {
        const page = await context.newPage()
        const errors = []
        page.on("pageerror", error => errors.push(error.message))
        await context.route("**/*", route => {
          if (new URL(route.request().url()).origin === origin) return route.continue()
          errors.push(`blocked off-origin request ${route.request().url()}`)
          return route.abort()
        })
        await page.goto(`${origin}/onboarding.html?scenario=denied`)
        await page.getByRole("heading", { level: 1, name: "What should Perchling do?" }).waitFor()
        const layout = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - innerWidth,
          column: document.querySelector("main")?.getBoundingClientRect().width ?? 0,
          dark: document.documentElement.classList.contains("dark"),
          wash: getComputedStyle(document.querySelector(".bg-brand-wash")).backgroundImage
        }))
        assert(layout.overflow <= 0, `horizontal overflow at ${width}px`)
        assert(layout.column <= 700 - 48 + 1, `column wider than the 700 px page at ${width}px`)
        assert.equal(layout.dark, colorScheme === "dark")
        assert.match(layout.wash, /linear-gradient/)
        await page.screenshot({ path: new URL(`step1-${colorScheme}-${width}.png`, screens).pathname, fullPage: true })
        await page.getByRole("checkbox", { name: "Quick actions" }).click()
        await page.getByRole("button", { name: "Continue with 1 feature" }).click()
        await page.getByRole("heading", { level: 1, name: "Before you start" }).waitFor()
        await page.screenshot({ path: new URL(`step2-${colorScheme}-${width}.png`, screens).pathname, fullPage: true })
        await page.getByRole("button", { name: "Agree and turn on 1 feature" }).click()
        await page.getByRole("heading", { level: 1, name: "Finish setting up" }).waitFor()
        await page.getByText("Needs site access").waitFor()
        await page.screenshot({ path: new URL(`step3-${colorScheme}-${width}.png`, screens).pathname, fullPage: true })
        assert.deepEqual(errors, [])
        console.log(`${engine} ${colorScheme} ${width}px: three steps rendered without overflow`)
      } finally {
        await context.close()
      }
    }
  }
} finally {
  await browser?.close()
  await new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())))
}
