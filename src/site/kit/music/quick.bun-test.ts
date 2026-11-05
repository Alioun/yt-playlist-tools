import { afterEach, expect, test } from "bun:test"
import type { TabView } from "../../../shared/contracts/tab-view"
import { album, ladyQueued, musicWorld, nowPlaying, playingItem, savedReport, song, songRow, type MusicWorld } from "../../../../tools/fixtures/music-quick/specimens"
import { settle } from "../../../../tools/fixtures/site-toaster/harness"
import { wireView } from "../../../../tools/fixtures/tab-view/cases"

const worlds: MusicWorld[] = []
afterEach(() => { for (const world of worlds.splice(0)) world.dispose() })
function world(options: Parameters<typeof musicWorld>[0] = {}) {
  const made = musicWorld(options)
  worlds.push(made)
  return made
}
const row = document.createElement("ytmusic-responsive-list-item-renderer")
const key = { opener: "music-keys", feedback: true, by: "key" } as const
const click = { opener: "music-actions", feedback: true, by: "click" } as const
const target = (item = songRow, move = false) => ({ title: item.title, videoId: item.videoId ?? null, item, element: row, move })

test("Play next on a song inserts it after the playing song, and Undo takes out what it inserted", async () => {
  const w = world()
  expect(await w.quick.act("next", target(), click)).toMatchObject({ kind: "done", text: "“Get Lucky” will play next" })
  expect(w.sent("queueInsert")).toEqual([{ kind: "queueInsert", endpoint: songRow.endpoints.next!, position: "next" }])
  expect(w.toast()?.content).toMatchObject({ text: "“Get Lucky” will play next", tone: "confirmation", action: { label: "Undo" } })
  await w.toast()?.act()
  expect(w.sent("queueRemoveIds")).toEqual([{ kind: "queueRemoveIds", ids: [100] }])
})

test("Add to queue on an album adds its songs as one block and names the count", async () => {
  const w = world({ answers: { queueInsert: () => ({ ids: Array.from({ length: 13 }, (_, n) => n) }) } })
  await w.quick.act("queue", target(album), click)
  expect(w.sent("queueInsert")).toEqual([{ kind: "queueInsert", endpoint: album.endpoints.end!, position: "end" }])
  expect(w.toast()?.content.text).toBe("Added 13 songs from “Random Access Memories” to the queue")
})

test("with nothing loaded, an insert starts playing the item and offers no Undo", async () => {
  const w = world({ answers: { nowPlaying: () => null } })
  await w.quick.act("queue", target(), click)
  expect(w.toast()?.content).toMatchObject({ text: "Playing “Get Lucky”", action: null })
})

test("Play next on a waiting queue item moves it, Undo moves it back, and an item already there only says so", async () => {
  const w = world()
  await w.quick.act("next", target(ladyQueued, true), click)
  expect(w.sent("queueMove")).toEqual([{ kind: "queueMove", id: ladyQueued.queueItemId!, to: "next" }])
  expect(w.sent("queueInsert")).toEqual([])
  expect(w.toast()?.content.text).toBe("Moved “Lady” to play next")
  await w.toast()?.act()
  expect(w.sent("queueMove")[1]).toEqual({ kind: "queueMove", id: ladyQueued.queueItemId!, to: 5 })
  const there = world({ answers: { queueMove: () => ({ from: 4, moved: false }) } })
  expect(await there.quick.act("queue", target(ladyQueued, true), click)).toEqual({ kind: "idle", text: "“Lady” is already at the end of the queue" })
  expect(there.toast()?.content).toMatchObject({ tone: "hint", action: null })
})

test("while casting every queue edit and its Undo answer that they aren't available, and nothing is sent", async () => {
  const w = world()
  w.cast(true)
  for (const action of ["next", "queue", "remove", "mix"] as const) {
    expect(await w.quick.act(action, target(ladyQueued, true), click)).toEqual({ kind: "idle", text: "Not available while casting" })
  }
  expect(w.jobs.map(entry => entry.job.kind).filter(kind => kind !== "castState")).toEqual([])
  w.cast(false)
  await w.quick.act("remove", target(ladyQueued), click)
  expect(w.toast()?.content.text).toBe("Removed “Lady” from the queue")
  w.cast(true)
  await w.toast()?.act()
  expect(w.toast()?.content.text).toBe("Not available while casting")
  expect(w.sent("queueReinsert")).toEqual([])
  w.cast(false)
}, { timeout: 10_000 })

test("when YouTube Music shows its own toast for a queue edit, the edit stands and ours stays away, so only one shows", async () => {
  const w = world({ noisy: ["queueInsert", "queueMove", "queueRemove"] })
  expect(await w.quick.act("next", target(), click)).toMatchObject({ kind: "done", text: "“Get Lucky” will play next" })
  expect(await w.quick.act("queue", target(ladyQueued, true), click)).toMatchObject({ kind: "done" })
  expect(await w.quick.act("remove", target(ladyQueued), click)).toMatchObject({ kind: "done" })
  expect(w.toast()).toBeNull()
  const quiet = world({ noisy: ["nowPlaying"] })
  await quiet.quick.act("next", target(), click)
  expect(quiet.toast()?.content.text).toBe("“Get Lucky” will play next")
})

test("Remove from queue's Undo puts the song back where it was", async () => {
  const w = world()
  await w.quick.act("remove", target(ladyQueued), click)
  expect(w.sent("queueRemove")).toEqual([{ kind: "queueRemove", id: ladyQueued.queueItemId! }])
  await w.toast()?.act()
  expect(w.sent("queueReinsert")).toEqual([{ kind: "queueReinsert", videoId: ladyQueued.videoId!, index: 4 }])
})

test("Like by key toasts with an Undo that restores the old state; by click the icon is the only answer", async () => {
  const w = world()
  await w.quick.act("like", target(), key)
  expect(w.jobs.find(entry => entry.job.kind === "like")).toMatchObject({ job: { kind: "like", endpoint: songRow.endpoints.like! }, acct: "AAAAAAAAAAAAAAAA" })
  expect(w.toast()?.content.text).toBe("Liked “Get Lucky”")
  await w.toast()?.act()
  expect(w.sent("like")[1]).toEqual({ kind: "like", endpoint: { likeEndpoint: { status: "INDIFFERENT", target: { videoId: song } } } })
  const clicked = world()
  expect(await clicked.quick.act("like", target(), click)).toEqual({ kind: "done", text: null })
  expect(clicked.toast()).toBeNull()
})

test("signed out, Like, Save to library and Save answer with their own sign-in failure and Sign in", async () => {
  const signedOut = wireView("music", false)
  const w = world({ view: signedOut })
  expect((await w.quick.act("like", target(), key)).text).toBe("Sign in to YouTube Music to like songs.")
  expect((await w.quick.act("library", target(), key)).text).toBe("Sign in to YouTube Music to save to your library.")
  expect((await w.quick.act("save", target(), key)).text).toBe("Sign in to YouTube Music to save songs.")
  expect(w.toast()?.content).toMatchObject({ tone: "failure", action: { label: "Sign in" } })
  await w.toast()?.act()
  expect(w.visited[0]).toContain(encodeURIComponent(encodeURIComponent("https://music.youtube.com/watch?v=getLucky001")))
  expect(w.jobs).toEqual([])
  expect(w.adds).toEqual([])
})

test("a key with nothing pointed at likes the playing song through its queue item", async () => {
  const w = world()
  expect(await w.quick.press("like", key)).toMatchObject({ kind: "done", text: "Liked “Get Lucky”" })
  expect(w.jobs.find(entry => entry.job.kind === "itemInfo")?.target).toBe(w.queueElement)
  expect(w.sent("like")).toEqual([{ kind: "like", endpoint: playingItem.endpoints.like! }])
})

test("pointing at an album with the Like key says it isn't available, and an unrecognised item says so as a failure", async () => {
  const unsupported = world({ resolution: { kind: "unsupported-item", target: {} as never, item: album, action: "like", reason: "action-unavailable" } })
  expect(await unsupported.quick.press("like", key)).toEqual({ kind: "idle", text: "Like isn't available for albums." })
  const unknown = world({ resolution: { kind: "unrecognised-item", element: row } })
  expect(await unknown.quick.press("next", key)).toEqual({ kind: "failed", text: "Couldn't tell which item you meant. Point at it again, or use the player." })
  const idle = world({ resolution: { kind: "nothing-playing" } })
  expect((await idle.quick.press("save", key)).text).toBe("Nothing is playing")
  expect(idle.adds).toEqual([])
})

test("Save adds the song as a YouTube Music quick-save, logs the outcome, and answers with the add flow's toast", async () => {
  const w = world()
  expect(await w.quick.act("save", target(), key)).toEqual({ kind: "done", text: "Saved “Get Lucky” to Favourites" })
  expect(w.adds).toEqual([{ site: "music", video: song, via: "quick-save", opener: "music-keys" }])
  expect(w.logs).toEqual([`save ${song} added`])
  await settle()
  expect(w.toast()?.content).toMatchObject({ text: "Saved “Get Lucky” to Favourites", action: { label: "Undo" } })
})

test("with no quick-save playlist, Save opens the picker in choose mode, but a key from any tab only says to choose one in the popup", async () => {
  const base = wireView("music")
  const none = { ...base, setup: base.signedIn && base.setup.kind === "live" ? { kind: "live", setup: { ...base.setup.setup, musicSave: null } } : base.setup } as TabView
  const w = world({ view: none, add: async () => ({ kind: "choose" }) })
  await w.quick.act("save", target(), key)
  await settle()
  expect(w.opened).toMatchObject([{ video: song, title: "Get Lucky", mode: { kind: "choose", shortcut: null }, opener: "music-keys" }])
  const away = world({ view: none })
  expect(await away.quick.act("save", target(), { ...key, opener: "any-tab-keys", anyTab: true }))
    .toEqual({ kind: "idle", text: "Alpha has no quick-save playlist on YouTube Music yet. Choose one in the popup." })
  expect(away.adds).toEqual([])
})

test("Show feedback off hides confirmations, never failures", async () => {
  const w = world({ answers: { queueInsert: () => ({ ok: false, reason: "failed" }) } })
  await w.quick.act("next", target(), { ...click, feedback: false })
  expect(w.toast()?.content).toMatchObject({ text: "Couldn't add “Get Lucky” to the queue. Try YouTube Music's ⋮ menu.", tone: "failure" })
  const quiet = world()
  expect(await quiet.quick.act("next", target(), { ...click, feedback: false })).toMatchObject({ kind: "done" })
  expect(quiet.toast()).toBeNull()
})

test("an action whose internals this tab lacks says it isn't working and points at the popup", async () => {
  const w = world({ answers: { queueInsert: () => ({ ok: false, reason: "unavailable" }) } })
  expect(await w.quick.act("next", target(), key)).toEqual({ kind: "failed", text: "Play next isn't working right now. The popup shows why." })
})

test("Start mix and Go to album open their page with no toast, and say so when the page doesn't change", async () => {
  const w = world()
  expect(await w.quick.act("album", target(), click)).toEqual({ kind: "done", text: null })
  expect(w.sent("navigate")).toEqual([{ kind: "navigate", endpoint: songRow.endpoints.album! }])
  expect(w.toast()).toBeNull()
  const stuck = world({ answers: { navigate: () => ({ ok: false, reason: "failed" }) } })
  expect((await stuck.quick.act("mix", target(), key)).text).toBe("Couldn't start a mix from “Get Lucky”. Try YouTube Music's ⋮ menu.")
})

test("Save to library by key names the new state, and Undo toggles back through the item's swapped endpoint", async () => {
  const swapped = { ...songRow, endpoints: { ...songRow.endpoints, library: { inLibrary: true, endpoint: { feedbackEndpoint: { feedbackToken: "remove" } } as never } } }
  const w = world({ answers: { itemInfo: () => swapped } })
  await w.quick.act("library", target(), key)
  expect(w.toast()?.content.text).toBe("Saved “Get Lucky” to your library")
  await w.toast()?.act()
  expect(w.sent("library")).toEqual([{ kind: "library", endpoint: songRow.endpoints.library!.endpoint }, { kind: "library", endpoint: swapped.endpoints.library.endpoint }])
})

test("the playing song is read from the page, whatever the pointer is on", async () => {
  const w = world({ resolution: { kind: "unrecognised-item", element: row } })
  const found = await w.quick.playing("save")
  expect(found).toMatchObject({ kind: "target", target: { videoId: nowPlaying.videoId, item: playingItem } })
  const ad = world({ answers: { nowPlaying: () => ({ ok: false, reason: "unavailable", detail: { kind: "music-ad", evidence: "adShowing" } }) } })
  expect(await ad.quick.playing("like")).toEqual({ kind: "idle", text: "An ad is playing" })
})

test("the picker opens below the Save button that was used, for the playing song's title", async () => {
  const w = world()
  const button = document.createElement("button")
  document.body.append(button)
  await w.quick.act("picker", target(), { ...click, button })
  expect(w.opened).toEqual([{ video: song, title: "Get Lucky", opener: "music-actions", anchor: { kind: "below", element: button }, mode: { kind: "save" } }])
  const broken = world({ popovers: null })
  expect(await broken.quick.act("picker", target(), key)).toEqual({ kind: "failed", text: "Couldn't open the playlist list. Try again." })
})

const altJ = { code: "KeyJ", char: "j", ctrl: false, alt: true, shift: false, meta: false }
const shortcutEntry = { id: "orig01" as never, label: "Alpha", watchLaterOnEveryAccount: false, key: altJ }
const shortcutKey = { opener: "shortcuts", feedback: true, by: "key" } as const

test("a playlist shortcut saves the pointed-at or playing song to its playlist, with the pending toast after 1 s", async () => {
  let answer = (_: typeof savedReport) => {}
  const w = world({ add: () => new Promise(resolve => { answer = resolve }) })
  const pending = w.quick.pressShortcut(shortcutEntry, shortcutKey)
  await settle()
  expect(w.adds).toEqual([{ site: "music", video: song, via: "shortcut", shortcut: "orig01" as never }])
  w.timers.advance(1000)
  expect(w.toast()?.content.text).toBe("Saving “Get Lucky” to Favourites…")
  answer(savedReport)
  expect(await pending).toEqual({ kind: "done", text: "Saved “Get Lucky” to Favourites" })
})

test("a playlist shortcut on an album only says songs can be saved, and one with no playlist offers Choose for that shortcut", async () => {
  const albumPointed = world({ resolution: { kind: "unsupported-item", target: {} as never, item: album, action: "playlist-shortcut", reason: "songs-only" } })
  expect(await albumPointed.quick.pressShortcut(shortcutEntry, shortcutKey)).toEqual({ kind: "idle", text: "Only songs can be saved to playlists." })
  expect(albumPointed.adds).toEqual([])
  const noPlaylist = { kind: "report", outcomes: {}, feedback: true, undo: null, titles: {},
    toast: { tone: "hint", auto: false, message: { kind: "no-playlist" }, action: { kind: "choose" }, remember: { tab: [], session: [] } } } as const
  const w = world({ add: async () => noPlaylist })
  await w.quick.pressShortcut(shortcutEntry, shortcutKey)
  await settle()
  expect(w.toast()?.content.text).toBe("Alpha has no playlist on Alpha yet.")
  await w.toast()?.act()
  await settle()
  expect(w.opened).toMatchObject([{ video: song, mode: { kind: "choose", shortcut: "orig01" }, opener: "shortcuts", anchor: { kind: "window" } }])
})

function withStatus(feature: "music-keys" | "shortcuts", status: { state: "not-working" | "partly-working"; actions?: ("next" | "queue" | "save")[] }): TabView {
  const base = wireView("music")
  return { ...base, statuses: base.statuses.map(entry => entry.feature === feature ? { ...entry, ...status } : entry) } as TabView
}
const altN = { code: "KeyN", char: "n", ctrl: false, alt: true, shift: false, meta: false }

test("while Quick-action shortcuts isn't working each key still answers, names its key, and raises the notice", async () => {
  const w = world({ view: withStatus("music-keys", { state: "not-working" }) })
  expect(await w.quick.press("next", { ...key, key: altN })).toEqual({ kind: "failed",
    text: "Play next (Alt+N) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now." })
  expect(w.notices).toEqual(["music-keys"])
  expect(w.jobs).toEqual([])
})

test("an action unavailable in this tab answers its key with a pointer to the popup, and the others still run", async () => {
  const w = world({ view: withStatus("music-keys", { state: "partly-working", actions: ["next", "queue"] }) })
  expect(await w.quick.press("queue", { ...key, key: altN })).toEqual({ kind: "failed", text: "Add to queue isn't working right now. The popup shows why." })
  expect(w.notices).toEqual([])
  expect((await w.quick.press("like", { ...key, key: altN })).kind).toBe("done")
})

test("while Playlist shortcuts isn't working its keys answer as Save to playlist and raise the notice", async () => {
  const w = world({ view: withStatus("shortcuts", { state: "not-working" }) })
  expect((await w.quick.pressShortcut(shortcutEntry, shortcutKey)).text)
    .toBe("Save to playlist (Alt+J) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now.")
  expect(w.notices).toEqual(["shortcuts"])
  expect(w.adds).toEqual([])
})
