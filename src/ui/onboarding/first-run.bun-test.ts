import { englishFirstRunText, pseudoFirstRunText } from "../../../tools/fixtures/localization/scripted"
import { describe, expect, test } from "bun:test"
import { render, screen, within } from "@testing-library/svelte"
import userEvent from "@testing-library/user-event"
import { flushSync } from "svelte"
import FirstRun from "./FirstRun.svelte"
import { createFirstRun } from "./flow.svelte"
import { createSetup } from "./setup.svelte"
import type { BrowserKind } from "./features"
import type {
  AccessSite, AgreementOutcome, AgreementRequest, ChoiceOutcome, ChoiceRequest, Destination, FirstRunOwner,
  PermissionGrant, PermissionNeeds, SetupView, SyncedChoices
} from "./owner"

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function scriptedOwner(browser: BrowserKind = "chrome") {
  const log: string[] = []
  const lookups: { result: Deferred<SyncedChoices>; cancelled: boolean }[] = []
  const permissions: { needs: PermissionNeeds; grant: Deferred<PermissionGrant> }[] = []
  const agreements: { request: AgreementRequest; outcome: Deferred<AgreementOutcome> }[] = []
  const setups: Deferred<SetupView>[] = []
  const access: { site: AccessSite; granted: Deferred<boolean> }[] = []
  const choices: { request: ChoiceRequest; outcome: Deferred<ChoiceOutcome> }[] = []
  const opened: Destination[] = []
  const owner: FirstRunOwner = {
    browser,
    lookupSyncedChoices() {
      log.push("lookup")
      const entry = { result: deferred<SyncedChoices>(), cancelled: false }
      lookups.push(entry)
      return { result: entry.result.promise, cancel() { entry.cancelled = true; log.push("cancel") } }
    },
    requestPermissions(needs) {
      log.push("permissions")
      const grant = deferred<PermissionGrant>()
      permissions.push({ needs, grant })
      return grant.promise
    },
    agree(request) {
      log.push("agree")
      const outcome = deferred<AgreementOutcome>()
      agreements.push({ request, outcome })
      return outcome.promise
    },
    readSetup() {
      log.push("read-setup")
      const view = deferred<SetupView>()
      setups.push(view)
      return view.promise
    },
    requestSiteAccess(site) {
      log.push(`access:${site}`)
      const granted = deferred<boolean>()
      access.push({ site, granted })
      return granted.promise
    },
    choosePlaylist(request) {
      log.push(`choose:${request.feature}`)
      const outcome = deferred<ChoiceOutcome>()
      choices.push({ request, outcome })
      return outcome.promise
    },
    open(destination) {
      opened.push(destination)
    }
  }
  return { owner, log, lookups, permissions, agreements, setups, access, choices, opened }
}

async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
  flushSync()
}

function show(owner: FirstRunOwner) {
  return render(FirstRun, { owner, text: englishFirstRunText(), markSrc: "brand/icon.svg" })
}

test("a stretched first-run snapshot supplies labels and remains inert", () => {
  const script = scriptedOwner()
  const text = pseudoFirstRunText()
  render(FirstRun, { owner: script.owner, text, markSrc: "brand/icon.svg" })
  expect(screen.getByRole("heading", { name: text.copy.pick.heading })).toBeVisible()
  expect(screen.getByRole("checkbox", { name: text.features.featureOf("auto-add").name })).toHaveAttribute("aria-checked", "false")
  expect(screen.getByRole("button", { name: text.copy.pick.continue(0) })).toBeVisible()
  expect(script.log).toEqual([])
})

test("a mounted first-run keeps the disclosure snapshot its owner received", async () => {
  const script = scriptedOwner()
  const text = englishFirstRunText()
  const view = render(FirstRun, { owner: script.owner, text, markSrc: "brand/icon.svg" })
  await view.rerender({ owner: script.owner, text: pseudoFirstRunText(), markSrc: "brand/icon.svg" })
  expect(screen.getByRole("heading", { name: text.copy.pick.heading })).toBeVisible()
  await userEvent.setup().click(screen.getByRole("button", { name: "Continue without features" }))
  await userEvent.setup().click(screen.getByRole("button", { name: "Agree" }))
  expect(script.agreements[0]?.request.displayed).toBe(text.disclosure)
})

const choice = (name: string) => screen.getByRole("checkbox", { name })
const button = (name: string | RegExp) => screen.getByRole("button", { name })

async function reachConsent(names: readonly string[]) {
  const user = userEvent.setup()
  for (const name of names) await user.click(choice(name))
  await user.click(button(/^Continue with/))
  flushSync()
  return user
}

const readyAccount = (rows: Extract<SetupView, { kind: "ready" }>["rows"], musicAccess: "granted" | "missing" | "not-needed" = "not-needed"): SetupView =>
  ({ kind: "ready", youtube: { kind: "account", account: { name: "Synthetic Account", handle: "@synthetic" } }, musicAccess, rows })

describe("step 1, feature choice", () => {
  test("starts with every feature unticked and reads nothing before the user asks for sync", () => {
    const script = scriptedOwner()
    show(script.owner)
    expect(screen.getByRole("heading", { level: 1, name: "What should Perchling do?" })).toBeVisible()
    for (const box of screen.getAllByRole("checkbox")) expect(box).toHaveAttribute("aria-checked", "false")
    expect(screen.getAllByRole("checkbox")).toHaveLength(11)
    expect(screen.getByRole("switch", { name: "Settings sync" })).toHaveAttribute("aria-checked", "false")
    expect(button("Continue without features")).toBeVisible()
    expect(script.log).toEqual([])
  })

  test("feature cards carry exact names, descriptions and footprint tags, Gather tabs included", () => {
    show(scriptedOwner().owner)
    expect(choice("Gather tabs")).toHaveAccessibleDescription(
      "Gathers the YouTube videos open in a window into one list or a playlist, and can close their tabs. It can also do it by itself. Doesn't change the page")
    expect(choice("Right-click for the video menu")).toHaveAccessibleDescription(
      "Right-clicking a video opens YouTube's own ⋮ menu. Hold Shift for the browser's menu. Changes right-click on the page")
    expect(choice("Keys from any tab")).toHaveAccessibleDescription(/Keys only, doesn't change the page$/)
    expect(choice("Quick-save on thumbnails")).toHaveAccessibleDescription(/Adds buttons to the page$/)
    expect(screen.getByRole("heading", { level: 2, name: "Everywhere" })).toBeVisible()
  })

  test("draft ticks change only the draft and the count, never the owner", async () => {
    const script = scriptedOwner()
    show(script.owner)
    const user = userEvent.setup()
    await user.click(choice("Auto-add"))
    await user.click(choice("Gather tabs"))
    flushSync()
    expect(choice("Auto-add")).toHaveAttribute("aria-checked", "true")
    expect(button("Continue with 2 features")).toBeVisible()
    await user.click(choice("Auto-add"))
    flushSync()
    expect(choice("Auto-add")).toHaveAttribute("aria-checked", "false")
    expect(button("Continue with 1 feature")).toBeVisible()
    expect(script.log).toEqual([])
  })

  test("sync pre-ticks only what the synced copy turns on, marked From sync", async () => {
    const script = scriptedOwner()
    show(script.owner)
    const user = userEvent.setup()
    await user.click(choice("Gather tabs"))
    await user.click(screen.getByRole("switch", { name: "Settings sync" }))
    flushSync()
    expect(screen.getByText(/Looking for synced settings/)).toBeVisible()
    script.lookups[0]!.result.resolve({ kind: "found", features: ["auto-add", "music-actions"] })
    await settle()
    expect(choice("Auto-add")).toHaveAttribute("aria-checked", "true")
    expect(choice("Auto-add")).toHaveAccessibleDescription(/^From sync /)
    expect(choice("Quick actions")).toHaveAttribute("aria-checked", "true")
    expect(choice("Gather tabs")).toHaveAttribute("aria-checked", "true")
    expect(choice("Gather tabs")).not.toHaveAccessibleDescription(/From sync/)
    expect(choice("Playlist shortcuts")).toHaveAttribute("aria-checked", "false")
    expect(button("Continue with 3 features")).toBeVisible()
    expect(script.log).toEqual(["lookup"])
  })

  test("turning sync off cancels its lookup and ignores a late answer", async () => {
    const script = scriptedOwner()
    show(script.owner)
    const user = userEvent.setup()
    const sync = screen.getByRole("switch", { name: "Settings sync" })
    await user.click(sync)
    await user.click(sync)
    flushSync()
    expect(script.lookups[0]!.cancelled).toBe(true)
    script.lookups[0]!.result.resolve({ kind: "found", features: ["auto-add"] })
    await settle()
    expect(choice("Auto-add")).toHaveAttribute("aria-checked", "false")
    expect(sync).toHaveAttribute("aria-checked", "false")
    expect(screen.queryByText(/Found your synced settings/)).toBeNull()
  })

  test("a failed or newer synced copy says so and leaves the draft alone", async () => {
    const script = scriptedOwner()
    show(script.owner)
    await userEvent.setup().click(screen.getByRole("switch", { name: "Settings sync" }))
    script.lookups[0]!.result.resolve({ kind: "update-needed" })
    await settle()
    expect(screen.getByRole("alert")).toHaveTextContent(/^Couldn't use your synced settings/)
    for (const box of screen.getAllByRole("checkbox")) expect(box).toHaveAttribute("aria-checked", "false")
  })

  test("on Chrome, a ticked feature that needs YouTube Music warns before Agree", async () => {
    show(scriptedOwner("chrome").owner)
    const user = userEvent.setup()
    expect(screen.queryByText("Chrome will ask for access to music.youtube.com when you agree.")).toBeNull()
    await user.click(choice("Playlist shortcuts"))
    flushSync()
    expect(screen.getByText("Chrome will ask for access to music.youtube.com when you agree.")).toBeVisible()
  })

  test("Firefox shows no music.youtube.com warning", async () => {
    show(scriptedOwner("firefox").owner)
    await userEvent.setup().click(choice("Quick actions"))
    flushSync()
    expect(screen.queryByText(/music\.youtube\.com/)).toBeNull()
  })

  test("keyboard reaches and toggles the cards and the sync switch", async () => {
    show(scriptedOwner().owner)
    const user = userEvent.setup()
    screen.getByRole("switch", { name: "Settings sync" }).focus()
    await user.tab()
    expect(document.activeElement).toBe(choice("Auto-add"))
    await user.keyboard(" ")
    flushSync()
    expect(choice("Auto-add")).toHaveAttribute("aria-checked", "true")
  })
})

describe("step 2, Before you start", () => {
  test("Continue moves focus to the disclosure heading and marks the second step current", async () => {
    show(scriptedOwner().owner)
    await reachConsent(["Auto-add"])
    await settle()
    const heading = screen.getByRole("heading", { level: 1, name: "Before you start" })
    expect(document.activeElement).toBe(heading)
    const steps = screen.getByRole("list", { name: "Setup steps" })
    expect(within(steps).getByText("Before you start").closest("li")).toHaveAttribute("aria-current", "step")
    expect(within(screen.getByRole("list", { name: "You picked" })).getByText("Auto-add")).toBeVisible()
    expect(button("Agree and turn on 1 feature")).toBeVisible()
  })

  test("Change features returns to step 1 with the draft kept", async () => {
    show(scriptedOwner().owner)
    const user = await reachConsent(["Auto-add", "Gather tabs"])
    await user.click(button("Change features"))
    flushSync()
    expect(choice("Auto-add")).toHaveAttribute("aria-checked", "true")
    expect(choice("Gather tabs")).toHaveAttribute("aria-checked", "true")
  })

  test("with nothing picked, the button reads Agree", async () => {
    show(scriptedOwner().owner)
    await reachConsentWithout()
    expect(button("Agree")).toBeVisible()
  })

  test("shows the disclosure text exactly, its cookie line still provisional", async () => {
    show(scriptedOwner("firefox").owner)
    await reachConsentWithout()
    const section = screen.getByRole("region", { name: "Before you start" })
    const items = within(section).getAllByRole("listitem").map(item => item.textContent?.replace(/\s+/g, " ").trim())
    expect(items).toEqual([
      "reads what you watch and listen to there: the video or song, its channel, and how much of it you've played;",
      "reads and changes your playlists, as you: it lists them, checks which ones already hold a video, and adds or removes videos when you ask, or when auto-add or automatic gathering does, using YouTube's own requests;",
      "reads the YouTube tabs open in a window when you gather them, or when automatic gathering does: their addresses and titles, to collect their videos. It closes those tabs only if you've asked it to;",
      "signs those requests the way YouTube's page does, with YouTube's sign-in cookie, inside the YouTube tab. It never stores that cookie or sends it anywhere else;",
      "watches for the shortcut keys you set on YouTube and YouTube Music pages, and ignores every other key. Keys you set in your browser for Keys from any tab are caught by the browser itself;",
      "keeps its settings in this browser, including your account's name, @handle and picture, a list of your playlists, and how much of each video you've watched (for up to 30 days)."
    ])
    expect(within(section).getAllByRole("listitem")[3]).toHaveAttribute("data-provisional", "ticket-25-cookie")
    expect(within(section).getByText("Perchling works inside your YouTube and YouTube Music tabs, as the account you're signed in to there. For the features you switch on, it:")).toBeVisible()
    expect(within(section).getByText("Nothing is sent to us or to anyone but YouTube. There are no ads and no analytics. If you turn on Settings sync, your settings also travel through Firefox's own sync.")).toBeVisible()
    const policy = within(section).getByRole("link", { name: "Privacy policy" })
    expect(policy).toHaveAttribute("href", "https://alioun.github.io/yt-playlist-tools/privacy/")
    expect(policy).toHaveAttribute("target", "_blank")
  })

  test("Not now stores nothing, says nothing is running, and Back returns to the disclosure", async () => {
    const script = scriptedOwner()
    show(script.owner)
    const user = await reachConsent(["Auto-add"])
    await user.click(button("Not now"))
    await settle()
    const heading = screen.getByRole("heading", { level: 1, name: "Nothing is running." })
    expect(document.activeElement).toBe(heading)
    expect(screen.getByText("Agree later from the toolbar icon or Settings. Until then, Perchling does nothing on YouTube.")).toBeVisible()
    expect(script.log).toEqual([])
    await user.click(button("Back"))
    flushSync()
    expect(button("Agree and turn on 1 feature")).toBeVisible()
  })
})

async function reachConsentWithout() {
  await userEvent.setup().click(button("Continue without features"))
  flushSync()
}

describe("Agree", () => {
  test("on Chrome, the music access prompt starts in the click before the agreement is awaited", async () => {
    const script = scriptedOwner("chrome")
    show(script.owner)
    await reachConsent(["Auto-add", "Quick actions"])
    button("Agree and turn on 2 features").click()
    expect(script.log).toEqual(["permissions", "agree"])
    expect(script.permissions[0]!.needs).toEqual({ music: true, browserMenu: false })
    expect(script.agreements[0]!.request.permissions).toBe(script.permissions[0]!.grant.promise)
    expect(script.agreements[0]!.request).toMatchObject({ attempt: 1, selected: ["auto-add", "music-actions"], syncOn: false })
  })

  test("Save from the browser's menu asks for its optional permission from the same click", async () => {
    const script = scriptedOwner("firefox")
    show(script.owner)
    await reachConsent(["Save from the browser's menu", "Quick actions"])
    button("Agree and turn on 2 features").click()
    expect(script.log).toEqual(["permissions", "agree"])
    expect(script.permissions[0]!.needs).toEqual({ music: false, browserMenu: true })
  })

  test("nothing that needs a permission asks for none", async () => {
    const script = scriptedOwner("chrome")
    show(script.owner)
    await reachConsent(["Auto-add"])
    button("Agree and turn on 1 feature").click()
    expect(script.log).toEqual(["agree"])
    expect(await script.agreements[0]!.request.permissions).toEqual({ music: false, browserMenu: false })
  })

  test("repeated clicks while pending send one agreement and keep focus on the busy button", async () => {
    const script = scriptedOwner()
    show(script.owner)
    await reachConsent(["Auto-add"])
    const agree = button("Agree and turn on 1 feature")
    agree.focus()
    agree.click()
    flushSync()
    agree.click()
    agree.click()
    flushSync()
    expect(script.log.filter(entry => entry === "agree")).toHaveLength(1)
    expect(agree).toHaveAttribute("aria-busy", "true")
    expect(agree).toHaveAttribute("aria-disabled", "true")
    expect(document.activeElement).toBe(agree)
    expect(button("Not now")).toBeDisabled()
    expect(button("Change features")).toBeDisabled()
  })

  test.each([
    ["unconfirmed", "Couldn't confirm your agreement was saved. Nothing is running yet. Try again."],
    ["rejected", "Couldn't save your agreement. Nothing is running yet. Try again."],
    ["sync-full", "Couldn't agree, because your synced settings are full. Nothing was saved. Turn off Settings sync, or make room in Settings on another browser, then try again."]
  ] as const)("a %s agreement is reported and never shown as agreed", async (reason, message) => {
    const script = scriptedOwner()
    show(script.owner)
    await reachConsent(["Auto-add"])
    button("Agree and turn on 1 feature").click()
    script.agreements[0]!.outcome.resolve({ kind: "not-agreed", attempt: 1, reason })
    await settle()
    expect(screen.getByRole("alert")).toHaveTextContent(message)
    expect(screen.queryByRole("heading", { name: "Finish setting up" })).toBeNull()
    expect(script.log).not.toContain("read-setup")
    button("Agree and turn on 1 feature").click()
    expect(script.agreements[1]!.request.attempt).toBe(2)
  })

  test("a thrown agreement reads as not saved", async () => {
    const script = scriptedOwner()
    show(script.owner)
    await reachConsent(["Auto-add"])
    button("Agree and turn on 1 feature").click()
    script.agreements[0]!.outcome.reject(new Error("synthetic"))
    await settle()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save your agreement. Nothing is running yet. Try again.")
  })

  test("an answer for another attempt, or one that drops a ticked feature, is unconfirmed", async () => {
    const script = scriptedOwner()
    show(script.owner)
    await reachConsent(["Auto-add", "Gather tabs"])
    button("Agree and turn on 2 features").click()
    script.agreements[0]!.outcome.resolve({ kind: "agreed", attempt: 7, applications: [{ feature: "auto-add", state: "enabled" }, { feature: "gather", state: "enabled" }] })
    await settle()
    expect(screen.getByRole("alert")).toHaveTextContent(/^Couldn't confirm your agreement/)
    button("Agree and turn on 2 features").click()
    script.agreements[1]!.outcome.resolve({ kind: "agreed", attempt: 2, applications: [{ feature: "auto-add", state: "enabled" }] })
    await settle()
    expect(screen.getByRole("alert")).toHaveTextContent(/^Couldn't confirm your agreement/)
    expect(screen.queryByRole("heading", { name: "Finish setting up" })).toBeNull()
  })
})

describe("step 3, Finish setting up", () => {
  async function agreed(script: ReturnType<typeof scriptedOwner>, names: readonly string[], outcome: AgreementOutcome) {
    show(script.owner)
    await reachConsent(names)
    button(/^Agree/).click()
    script.agreements[0]!.outcome.resolve(outcome)
    await screen.findByRole("heading", { level: 1, name: "Finish setting up" })
    await settle()
  }

  test("a denied music prompt keeps consent and the ticked features saved on, held with Needs site access", async () => {
    const script = scriptedOwner("chrome")
    show(script.owner)
    await reachConsent(["Auto-add", "Playlist shortcuts", "Quick actions"])
    button("Agree and turn on 3 features").click()
    expect(script.agreements[0]!.request.selected).toEqual(["auto-add", "shortcuts", "music-actions"])
    script.permissions[0]!.grant.resolve({ music: false, browserMenu: false })
    script.agreements[0]!.outcome.resolve({
      kind: "agreed", attempt: 1, applications: [
        { feature: "auto-add", state: "enabled" },
        { feature: "shortcuts", state: "enabled", alsoOnMusic: "held-site-access" },
        { feature: "music-actions", state: "held-site-access" }
      ]
    })
    const heading = await screen.findByRole("heading", { level: 1, name: "Finish setting up" })
    await settle()
    expect(document.activeElement).toBe(heading)
    script.setups[0]!.resolve(readyAccount([
      { feature: "auto-add", target: { purpose: "auto-add", selection: { kind: "none" } } },
      { feature: "shortcuts", alsoOnMusicHeld: true, target: { purpose: "shortcut", key: "Alt+W", selection: { kind: "chosen", titles: ["Watch later"] } } },
      { feature: "music-actions", held: "site-access" }
    ], "missing"))
    await settle()
    const music = screen.getByText("Quick actions").closest("li")!
    expect(within(music).getByText("Needs site access")).toBeVisible()
    const shortcuts = screen.getByText("Playlist shortcuts").closest("li")!
    expect(within(shortcuts).getByText("Alt+W saves to")).toBeVisible()
    expect(within(shortcuts).getByText("Watch later")).toBeVisible()
    expect(within(shortcuts).getByText("Also on YouTube Music needs site access. Shortcuts work on YouTube now.")).toBeVisible()
    expect(screen.queryByText(/\boff\b|stays off/i)).toBeNull()
    expect(screen.getByText("Your features are on. Some of them need a playlist for your YouTube account.")).toBeVisible()
    button("Give access to YouTube Music").click()
    expect(script.log.at(-1)).toBe("access:music")
    script.access[0]!.granted.resolve(true)
    await settle()
    expect(script.log.at(-1)).toBe("read-setup")
  })

  test("Gather tabs reads its ready line and needs no playlist", async () => {
    const script = scriptedOwner()
    await agreed(script, ["Gather tabs"], { kind: "agreed", attempt: 1, applications: [{ feature: "gather", state: "enabled" }] })
    script.setups[0]!.resolve(readyAccount([{ feature: "gather" }]))
    await settle()
    expect(screen.getByText("Ready. Choose where it gathers in the popup or Settings.")).toBeVisible()
  })

  test("a playlist choice shows only after the owner confirms it", async () => {
    const script = scriptedOwner()
    await agreed(script, ["Quick-save on thumbnails"], { kind: "agreed", attempt: 1, applications: [{ feature: "quick-save", state: "enabled" }] })
    script.setups[0]!.resolve(readyAccount([{ feature: "quick-save", target: { purpose: "quick-save", selection: { kind: "none" } } }]))
    await settle()
    const row = screen.getByText("Quick-save on thumbnails").closest("li")!
    const chooser = within(row).getByRole("button", { name: "Choose a playlist for Quick-save on thumbnails" })
    chooser.click()
    chooser.click()
    flushSync()
    expect(script.choices).toHaveLength(1)
    expect(script.choices[0]!.request).toEqual({ feature: "quick-save", purpose: "quick-save" })
    expect(within(row).getByText("Ask the first time")).toBeVisible()
    script.choices[0]!.outcome.resolve({ kind: "confirmed", selection: { kind: "chosen", titles: ["Synthetic list"] } })
    await settle()
    expect(within(row).getByText("Synthetic list")).toBeVisible()
  })

  test("a failed or unavailable picker leaves the shown choice unchanged", async () => {
    const script = scriptedOwner()
    await agreed(script, ["Quick-save on thumbnails"], { kind: "agreed", attempt: 1, applications: [{ feature: "quick-save", state: "enabled" }] })
    script.setups[0]!.resolve(readyAccount([{ feature: "quick-save", target: { purpose: "quick-save", selection: { kind: "chosen", titles: ["Kept list"] } } }]))
    await settle()
    const row = screen.getByText("Quick-save on thumbnails").closest("li")!
    within(row).getByRole("button", { name: /^Choose a playlist/ }).click()
    script.choices[0]!.outcome.resolve({ kind: "failed", reason: "picker-unavailable" })
    await settle()
    expect(within(row).getByRole("alert")).toHaveTextContent("Couldn't open the playlist list. Try again.")
    expect(within(row).getByText("Kept list")).toBeVisible()
    within(row).getByRole("button", { name: /^Choose a playlist/ }).click()
    script.choices[1]!.outcome.resolve({ kind: "failed", reason: "unconfirmed" })
    await settle()
    expect(within(row).getByRole("alert")).toHaveTextContent("Couldn't confirm this choice was saved. Try again.")
    expect(within(row).getByText("Kept list")).toBeVisible()
  })

  test("without an account, playlist rows wait for one and the YouTube state leads", async () => {
    const script = scriptedOwner()
    await agreed(script, ["Auto-add"], { kind: "agreed", attempt: 1, applications: [{ feature: "auto-add", state: "enabled" }] })
    script.setups[0]!.resolve({ kind: "ready", youtube: { kind: "signed-out" }, musicAccess: "not-needed", rows: [{ feature: "auto-add", target: { purpose: "auto-add", selection: { kind: "none" } } }] })
    await settle()
    expect(screen.getByText("You're not signed in to YouTube.")).toBeVisible()
    expect(screen.getByText("Needs your YouTube account")).toBeVisible()
    button("Sign in").click()
    button("Open Settings").click()
    expect(script.opened).toEqual(["sign-in", "settings"])
  })

  test("an unreadable setup says so instead of inventing one", async () => {
    const script = scriptedOwner()
    await agreed(script, ["Auto-add"], { kind: "agreed", attempt: 1, applications: [{ feature: "auto-add", state: "enabled" }] })
    script.setups[0]!.reject(new Error("synthetic"))
    await settle()
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't read your YouTube setup. Your agreement is saved. Open Settings to finish setting up.")
  })
})

test("two first-run pages keep independent drafts", async () => {
  const first = document.createElement("div")
  const second = document.createElement("div")
  document.body.append(first, second)
  try {
    render(FirstRun, { target: first, props: { owner: scriptedOwner().owner, text: englishFirstRunText(), markSrc: "a.svg" } })
    render(FirstRun, { target: second, props: { owner: scriptedOwner().owner, text: englishFirstRunText(), markSrc: "b.svg" } })
    await userEvent.setup().click(within(first).getByRole("checkbox", { name: "Auto-add" }))
    flushSync()
    expect(within(first).getByRole("checkbox", { name: "Auto-add" })).toHaveAttribute("aria-checked", "true")
    expect(within(second).getByRole("checkbox", { name: "Auto-add" })).toHaveAttribute("aria-checked", "false")
  } finally {
    first.remove()
    second.remove()
  }
})


describe("view disposal", () => {
  test("a disposed flow ignores a pending agreement and starts no further requests", async () => {
    const script = scriptedOwner()
    const flow = createFirstRun(script.owner, englishFirstRunText())
    flow.toggle("gather", true)
    flow.continue()
    const pending = flow.agree()
    const before = flow.agreement
    flow.dispose()
    script.agreements[0]!.outcome.resolve({ kind: "agreed", attempt: 1, applications: [{ feature: "gather", state: "enabled" }] })
    await pending
    expect(flow.agreement).toEqual(before)
    expect(flow.step).toBe("consent")
    flow.agree()
    flow.changeFeatures()
    flow.setSync(true)
    expect(script.log).toEqual(["agree"])
  })

  test("a disposed flow keeps a permission-backed agreement local continuation silent", async () => {
    const script = scriptedOwner()
    const owner: FirstRunOwner = { ...script.owner, async agree(request) {
      await request.permissions
      return { kind: "agreed", attempt: request.attempt, applications: [{ feature: "music-actions", state: "held-site-access" }] }
    } }
    const flow = createFirstRun(owner, englishFirstRunText())
    flow.toggle("music-actions", true)
    flow.continue()
    const pending = flow.agree()
    expect(script.permissions).toHaveLength(1)
    flow.dispose()
    script.permissions[0]!.grant.resolve({ music: false, browserMenu: false })
    await pending
    expect(flow.step).toBe("consent")
    expect(flow.agreement.kind).toBe("pending")
  })

  test("a disposed flow cancels a lookup and ignores its answer", async () => {
    const script = scriptedOwner()
    const flow = createFirstRun(script.owner, englishFirstRunText())
    flow.setSync(true)
    flow.dispose()
    script.lookups[0]!.result.resolve({ kind: "found", features: ["gather"] })
    await settle()
    expect(script.lookups[0]!.cancelled).toBe(true)
    expect(flow.picked).toEqual([])
  })

  test("a disposed setup ignores pending loads and starts no new work", async () => {
    const script = scriptedOwner()
    const setup = createSetup(script.owner)
    const pending = setup.load()
    setup.dispose()
    script.setups[0]!.resolve(readyAccount([{ feature: "gather" }]))
    await pending
    expect(setup.view).toEqual({ kind: "loading" })
    await setup.load()
    await setup.giveAccess("music")
    expect(script.log).toEqual(["read-setup"])
  })

  test("a disposed setup ignores a permission answer without re-reading setup", async () => {
    const script = scriptedOwner()
    const setup = createSetup(script.owner)
    const pending = setup.giveAccess("music")
    expect(script.log).toEqual(["access:music"])
    setup.dispose()
    script.access[0]!.granted.resolve(false)
    await pending
    expect(setup.accessDenied).toBeUndefined()
    expect(script.log).toEqual(["access:music"])
  })

  test("a disposed setup ignores a confirmed choice without undoing the owner write", async () => {
    const script = scriptedOwner()
    const setup = createSetup(script.owner)
    const row = { feature: "quick-save", target: { purpose: "quick-save", selection: { kind: "none" } } } as const
    const loaded = setup.load()
    script.setups[0]!.resolve(readyAccount([row]))
    await loaded
    const before = setup.view
    const pending = setup.choose(row)
    setup.dispose()
    script.choices[0]!.outcome.resolve({ kind: "confirmed", selection: { kind: "chosen", titles: ["Late choice"] } })
    await pending
    expect(setup.view).toEqual(before)
    expect(setup.choice("quick-save")).toEqual({ kind: "pending" })
    expect(setup.choose(row)).toBeUndefined()
    expect(script.choices).toHaveLength(1)
  })

  test("unmounting FirstRun during agreement does not read setup after the answer", async () => {
    const script = scriptedOwner()
    const mounted = show(script.owner)
    await reachConsent(["Gather tabs"])
    button(/^Agree/).click()
    mounted.unmount()
    script.agreements[0]!.outcome.resolve({ kind: "agreed", attempt: 1, applications: [{ feature: "gather", state: "enabled" }] })
    await settle()
    expect(script.setups).toHaveLength(0)
    expect(screen.queryByRole("heading", { name: "Finish setting up" })).toBeNull()
  })

  test("unmounting FirstRun while its finish import settles does not mount setup", async () => {
    const script = scriptedOwner()
    const mounted = show(script.owner)
    await reachConsent(["Gather tabs"])
    button(/^Agree/).click()
    script.agreements[0]!.outcome.resolve({ kind: "agreed", attempt: 1, applications: [{ feature: "gather", state: "enabled" }] })
    await Promise.resolve()
    flushSync()
    mounted.unmount()
    await settle()
    expect(script.setups).toHaveLength(0)
  })
})


test.each([
  { label: "duplicate", applications: [{ feature: "gather", state: "enabled" }, { feature: "gather", state: "enabled" }] },
  { label: "missing", applications: [] },
  { label: "unrelated", applications: [{ feature: "quick-save", state: "enabled" }] }
] satisfies readonly { label: string; applications: readonly import("./owner").FeatureApplication[] }[])("agreement rejects $label confirmations", async ({ applications }) => {
  const script = scriptedOwner()
  const flow = createFirstRun(script.owner, englishFirstRunText())
  flow.toggle("gather", true)
  flow.continue()
  const pending = flow.agree()
  script.agreements[0]!.outcome.resolve({ kind: "agreed", attempt: 1, applications })
  await pending
  expect(flow.step).toBe("consent")
  expect(flow.agreement).toEqual({ kind: "failed", reason: "unconfirmed" })
  flow.dispose()
})
