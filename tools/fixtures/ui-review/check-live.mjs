import assert from "node:assert/strict"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
const { chromium } = await import(pathToFileURL(resolve("node_modules/playwright/index.mjs")).href)
const profile = await mkdtemp(join(tmpdir(), "perchling-live-profile-"))
const extension = resolve(".output/chrome-mv3")
const output = process.argv[2] ?? (await mkdtemp(join(tmpdir(), "perchling-live-review-")))
await mkdir(output, { recursive: true })
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  chromiumSandbox: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1280, height: 800 }
})
const report = { extension, errors: [], pages: [] }
context.on("page", page => page.on("pageerror", error => report.errors.push(error.message)))
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 30000 }))
  const id = new URL(worker.url()).hostname
  report.extensionId = id
  console.log(JSON.stringify({ step: "installed", worker: worker.url() }))
  const youtube = await context.newPage()
  await youtube.addLocatorHandler(youtube.locator('ytd-consent-bump-v2-lightbox [role="dialog"]'), async overlay => {
    await overlay.getByText("Reject all", { exact: true }).click()
  })
  await youtube.goto("https://www.youtube.com/watch?v=jNQXAC9IVRw", { waitUntil: "domcontentloaded", timeout: 45000 })
  await youtube.locator("ytd-app").waitFor({ timeout: 30000 })
  await youtube.locator("video").evaluate(video => video.pause())
  await youtube
    .locator("ytd-consent-bump-v2-lightbox")
    .getByText("Reject all", { exact: true })
    .click({ timeout: 5000 })
    .catch(() => {})
  report.youtube = await youtube.evaluate(() => ({ title: document.title, signedIn: window.ytcfg?.get("LOGGED_IN") }))
  console.log(JSON.stringify({ step: "youtube", ...report.youtube }))
  const onboarding = await context.newPage()
  await onboarding.goto(`chrome-extension://${id}/onboarding.html`)
  for (const feature of ["Queue button on thumbnails", "Watch-page button", "Quick-save on thumbnails"]) {
    await onboarding.getByRole("checkbox", { name: feature, exact: true }).click()
  }
  await onboarding.getByRole("button", { name: "Continue with 3 features" }).click()
  console.log(JSON.stringify({ step: "consent", text: await onboarding.locator("main").innerText() }))
  await onboarding.getByRole("button", { name: /^Agree/ }).click()
  await onboarding.getByRole("heading", { name: "Finish setting up", exact: true }).waitFor()
  await onboarding.getByText(/^(You're not signed in to YouTube\.|Open YouTube to finish)$/).waitFor({ timeout: 15000 })
  report.finish = await onboarding.locator("main").innerText()
  console.log(JSON.stringify({ step: "agreed", text: report.finish }))
  if (report.finish.includes("Open YouTube to finish")) {
    const opened = context.waitForEvent("page")
    await onboarding.getByRole("button", { name: "Open YouTube", exact: true }).first().click()
    const recovery = await opened
    await recovery.waitForLoadState("domcontentloaded")
    await recovery.locator("ytd-app").waitFor({ timeout: 30000 })
    await recovery
      .locator("ytd-consent-bump-v2-lightbox")
      .getByText("Reject all", { exact: true })
      .click({ timeout: 5000 })
      .catch(() => {})
    await onboarding.bringToFront()
    // Headless Chromium keeps tabs focused and visible; bringToFront emits no return event.
    // Exercise the production listener explicitly while keeping native backend/account reads.
    await onboarding.evaluate(() => window.dispatchEvent(new Event("focus")))
    report.returnEvent = "simulated-focus-in-headless-chromium"
    await onboarding.getByText("You're not signed in to YouTube.", { exact: true }).waitFor({ timeout: 15000 })
    report.finishRecovery = await onboarding.locator("main").innerText()
    assert.ok(!report.finishRecovery.includes("Open YouTube to finish"), "Finish must refresh after returning from YouTube")
    await onboarding.getByRole("button", { name: "Sign in", exact: true }).waitFor()
    await onboarding.screenshot({ path: join(output, "finish-recovery.png") })
    console.log(JSON.stringify({ step: "finish-recovery", text: report.finishRecovery }))
    await recovery.close()
  }
  await worker.evaluate(async url => {
    const [tab] = await chrome.tabs.query({ url })
    if (tab?.id !== undefined) await chrome.tabs.update(tab.id, { active: true })
  }, youtube.url())
  await youtube.reload({ waitUntil: "domcontentloaded" })
  await youtube.bringToFront()
  await youtube
    .locator("ytd-consent-bump-v2-lightbox")
    .getByText("Reject all", { exact: true })
    .click({ timeout: 5000 })
    .catch(() => {})
  await youtube.locator("ytd-watch-flexy").waitFor()
  await youtube.locator("video").evaluate(video => video.pause())
  await youtube.getByRole("heading", { level: 1 }).waitFor()
  const watch = youtube.locator("pp-watch-button button")
  await watch.waitFor({ state: "visible", timeout: 15000 })
  report.watchButton = { label: await watch.getAttribute("aria-label"), rect: await watch.boundingBox() }
  console.log(
    JSON.stringify({
      step: "cookie-buttons",
      buttons: await youtube
        .locator("ytd-consent-bump-v2-lightbox")
        .evaluateAll(nodes => nodes.flatMap(n => Array.from(n.querySelectorAll("button,[role=button]")).map(x => ({ tag: x.tagName, text: x.textContent, label: x.getAttribute("aria-label") }))))
    })
  )
  await watch.click()
  report.watchMenu = await youtube.locator("pp-watch-menu").evaluate(node => node.shadowRoot?.innerHTML)
  console.log(JSON.stringify({ step: "watch-menu", label: report.watchButton, html: report.watchMenu?.slice(-2500) }))
  await youtube.keyboard.press("Escape")
  await watch.click()
  await youtube.locator("pp-watch-menu").getByRole("menuitem", { name: "Save to…", exact: true }).click()
  await youtube.getByRole("button", { name: "Sign in", exact: true }).waitFor({ state: "visible", timeout: 15000 })
  report.signedOutPicker = await youtube.evaluate(() =>
    Array.from(document.querySelectorAll("*"))
      .filter(n => n.tagName.startsWith("PP-"))
      .map(n => ({ tag: n.tagName, text: n.shadowRoot?.textContent?.slice(-1500) }))
  )
  assert.ok(
    report.signedOutPicker.some(node => /sign in/i.test(node.text ?? "")),
    "Signed-out save needs recovery feedback"
  )
  console.log(JSON.stringify({ step: "signed-out-picker", text: report.signedOutPicker }))
  await youtube.screenshot({ path: join(output, "signed-out-picker.png") })
  await youtube.keyboard.press("Escape")
  await youtube.goto("https://www.youtube.com/results?search_query=space", { waitUntil: "domcontentloaded" })
  const thumb = youtube.locator("ytd-video-renderer a#thumbnail").first()
  await thumb.hover({ timeout: 30000 })
  await youtube.waitForTimeout(2000)
  const overlay = youtube.locator("pp-overlay")
  assert.equal(await overlay.locator('[data-slot="quick-save"] button:visible').count(), 1, "An unset Quick-save destination shows only one Save button")
  const save = overlay.getByRole("button", { name: "Save to…", exact: true }).first()
  await overlay.getByRole("button", { name: "Add to queue", exact: true }).click({ trial: true, timeout: 5000 })
  await save.click({ trial: true, timeout: 5000 })
  report.thumbnailPlacement = await overlay.evaluate(host => {
    const parent = host.parentElement
    const media = parent?.querySelector(".ytdVideoPreviewMediaContainer") ?? parent
    return {
      preview: !!parent?.closest("#video-preview"),
      media: media?.getBoundingClientRect().toJSON(),
      buttons: Array.from(host.shadowRoot.querySelectorAll("button"))
        .map(button => button.getBoundingClientRect().toJSON())
        .filter(rect => rect.width > 0 && rect.height > 0)
    }
  })
  if (report.thumbnailPlacement.preview) {
    const { media, buttons } = report.thumbnailPlacement
    assert.ok(
      media && buttons.every(rect => rect.left >= media.left && rect.top >= media.top && rect.right <= media.right && rect.bottom <= media.bottom),
      "Preview controls must stay inside the visible media"
    )
  }
  await youtube.screenshot({ path: join(output, "thumbnail-preview.png") })
  await save.click({ timeout: 5000 })
  await youtube.getByRole("button", { name: "Sign in", exact: true }).waitFor({ state: "visible", timeout: 15000 })
  report.thumbnailClick = "signed-out-recovery-shown"
  report.thumbnail = await youtube.evaluate(() => ({
    overlays: Array.from(document.querySelectorAll("pp-overlay")).map(node => ({ html: node.shadowRoot?.innerHTML.slice(-3000), rect: node.getBoundingClientRect().toJSON() })),
    nativeQueue: Array.from(document.querySelectorAll("ytd-video-renderer"))
      .slice(0, 1)
      .map(node => ({ native: !!node.querySelector('[aria-label="Add to queue"]'), html: node.outerHTML.slice(0, 1000) }))
  }))
  assert.ok(report.thumbnail.overlays.length > 0, "Thumbnail overlay must mount on a real search result")
  console.log(JSON.stringify({ step: "thumbnail", ...report.thumbnail }))
  await youtube.screenshot({ path: join(output, "live-watch.png"), fullPage: true })
  report.integration = await youtube.evaluate(() => ({
    customElements: Array.from(document.querySelectorAll("*"))
      .filter(x => x.tagName.startsWith("PP-"))
      .map(x => ({ tag: x.tagName, text: x.shadowRoot?.textContent?.slice(-1000) ?? x.textContent })),
    extensionScripts: Array.from(document.scripts)
      .filter(x => x.src.startsWith("chrome-extension:"))
      .map(x => x.src),
    buttons: Array.from(document.querySelectorAll("button"))
      .map(x => x.getAttribute("aria-label") || x.textContent)
      .filter(x => /Perchling|auto-add|Save to|playlist|queue/i.test(x ?? ""))
  }))
  console.log(JSON.stringify({ step: "integration", ...report.integration }))
  for (const name of ["onboarding", "popup", "options"]) {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${id}/${name}.html`, { waitUntil: "networkidle" })
    if (name === "popup") await page.setViewportSize({ width: 360, height: 600 })
    report.pages.push({ name, text: await page.locator("body").innerText() })
    await page.screenshot({ path: join(output, `${name}.png`), fullPage: true })
    console.log(JSON.stringify({ step: name, text: report.pages.at(-1).text.slice(0, 2500) }))
  }
} catch (error) {
  process.exitCode = 1
  report.failure = String(error)
  report.atFailure = await Promise.all(
    context.pages().map(async page => ({
      url: page.url(),
      watchButton: await page.locator("pp-watch-button").evaluateAll(nodes => nodes.map(node => ({ html: node.outerHTML, shadow: node.shadowRoot?.innerHTML }))),
      text: (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(-5000)
    }))
  )
  console.log(JSON.stringify({ failure: report.failure }))
} finally {
  await writeFile(join(output, "probe.json"), JSON.stringify(report, null, 2))
  await context.close()
  console.log(JSON.stringify({ output, passed: !report.failure, errors: report.errors }))
}
