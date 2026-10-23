import { anyFilterOn, isFilteredOut, addListedChannel, listChannelIn, removeListedChannel, setFilterSetting } from "@/lib/channel-filters"
import { parseChannelInput, type ChannelQuery } from "@/lib/channel-input"
import * as store from "@/lib/storage"
import { addVideoToPlaylist, fetchChannel, fetchUserPlaylists, fetchVideoChannel } from "@/lib/youtube"
import { checkSession, findSession, isAccountKey, isRecord, isSnapshot, queueInPage, reconcileScripts, requireConsent, SessionFailure, sessionMessage, type Caller, type SessionSnapshot } from "@/lib/session"

type Sender = Parameters<Parameters<typeof browser.runtime.onMessage.addListener>[0]>[1]

export default defineBackground(() => {
  const lanes = new Map<string, Promise<unknown>>()
  store.sessionConsent.watch(() => { void reconcileScripts().catch(() => {}) })
  void store.removeLegacyCredentials().catch(() => {})
  void reconcileScripts().catch(() => {})

  function serial<T>(session: SessionSnapshot, action: () => Promise<T>): Promise<T> {
    const key = `${session.incognito}:${session.accountKey}`
    const pending = (lanes.get(key) ?? Promise.resolve()).catch(() => {}).then(action)
    lanes.set(key, pending)
    void pending.finally(() => { if (lanes.get(key) === pending) lanes.delete(key) }).catch(() => {})
    return pending
  }

  async function callerFor(sender: Sender, message: Record<string, unknown>): Promise<Caller> {
    if (sender.id !== browser.runtime.id || (sender.frameId !== undefined && sender.frameId !== 0)) throw new SessionFailure("unavailable")
    const validPage = sender.url === browser.runtime.getURL("/popup.html") || sender.url === browser.runtime.getURL("/options.html")
    if (validPage) {
      if (typeof message.windowId !== "number" || !Number.isInteger(message.windowId) ||
        (sender.tab && sender.tab.windowId !== message.windowId)) throw new SessionFailure("unavailable")
      const window = await browser.windows.get(message.windowId)
      return { incognito: window.incognito, windowId: message.windowId }
    }
    if (sender.tab && sender.frameId === 0 && sender.tab.id !== undefined && sender.url?.startsWith("https://www.youtube.com/")) {
      return { tabId: sender.tab.id, incognito: sender.tab.incognito, windowId: sender.tab.windowId }
    }
    throw new SessionFailure("unavailable")
  }

  async function snapshotFor(caller: Caller, value: unknown): Promise<SessionSnapshot> {
    if (!isSnapshot(value) || value.incognito !== caller.incognito || (caller.tabId !== undefined && caller.tabId !== value.tabId)) {
      throw new SessionFailure("accountChanged")
    }
    await checkSession(value)
    return value
  }

  async function view(caller: Caller) {
    const state = await findSession(caller)
    if (state.kind !== "ready") return state
    const playlists = await fetchUserPlaylists(state.session)
    await serial(state.session, () => store.cacheAccountPlaylists(state.session, playlists))
    return { ...state, playlists, setup: await store.getAccountSetup(state.session), unclaimed: await store.hasUnclaimedSetup() }
  }

  async function notify(tabId: number, message: string) {
    try {
      await requireConsent()
      await browser.tabs.sendMessage(tabId, { action: "showToast", toastMessage: message })
    } catch {}
  }

  async function add(caller: Caller, message: Record<string, unknown>) {
    if (caller.tabId === undefined || !isAccountKey(message.accountKey) ||
      typeof message.videoId !== "string" || !/^[\w-]{11}$/.test(message.videoId)) throw new SessionFailure("unavailable")
    const session: SessionSnapshot = { tabId: caller.tabId, accountKey: message.accountKey, incognito: caller.incognito }
    const videoId = message.videoId
    const expires = Date.now() + 10000
    return serial(session, async () => {
      const alive = () => { if (Date.now() >= expires) throw new SessionFailure("unavailable") }
      alive()
      await checkSession(session)
      const setup = await store.getAccountSetup(session)
      const automatic = message.action === "addVideoToPlaylists"
      let targets = automatic ? setup.playlists : [setup.shortcutPlaylistId].filter(Boolean)
      if (!targets.length) {
        await notify(session.tabId, automatic ? "No auto-add playlists selected" : "No shortcut playlist selected")
        return { ok: false }
      }
      if (automatic && anyFilterOn(setup.filters, targets)) {
        alive()
        const channel = await fetchVideoChannel(session, videoId)
        const blocked = targets.filter(id => isFilteredOut(setup.filters[id], channel?.channelId ?? null))
        targets = targets.filter(id => !blocked.includes(id))
        if (blocked.length) await notify(session.tabId, channel ? `${channel.title} filtered out` : "Couldn't identify the channel, so allowlisted playlists were skipped")
      }
      for (const playlistId of targets) {
        alive()
        const result = await addVideoToPlaylist(session, playlistId, videoId, expires)
        await notify(session.tabId, result.alreadyIn ? "Video already in playlist." : `Added ${videoId} to playlist`)
      }
      return { ok: true }
    })
  }

  function queryFrom(value: unknown): ChannelQuery {
    if (!isRecord(value)) throw new SessionFailure("unavailable")
    let input: string
    if (value.by === "id" && typeof value.id === "string") input = value.id
    else if (value.by === "handle" && typeof value.handle === "string") input = value.handle
    else if (value.by === "username" && typeof value.username === "string") input = `https://www.youtube.com/user/${encodeURIComponent(value.username)}`
    else throw new SessionFailure("unavailable")
    const parsed = parseChannelInput(input)
    if ("error" in parsed) throw new SessionFailure("unavailable")
    return parsed.query
  }

  async function changeSetup(session: SessionSnapshot, change: unknown) {
    if (!isRecord(change) || typeof change.playlistId !== "string" || !/^[\w-]{1,150}$/.test(change.playlistId)) throw new SessionFailure("unavailable")
    const setup = await store.getAccountSetup(session)
    const id = change.playlistId
    switch (change.kind) {
      case "auto":
        if (typeof change.checked !== "boolean") throw new SessionFailure("unavailable")
        setup.playlists = change.checked ? [...new Set([...setup.playlists, id])] : setup.playlists.filter(value => value !== id)
        break
      case "shortcut": setup.shortcutPlaylistId = setup.shortcutPlaylistId === id ? "" : id; break
      case "setting":
        if (change.setting !== "off" && change.setting !== "allow" && change.setting !== "deny") throw new SessionFailure("unavailable")
        Object.assign(setup, setFilterSetting(setup, id, change.setting)); break
      case "remove":
        if (typeof change.channelId !== "string") throw new SessionFailure("unavailable")
        Object.assign(setup, removeListedChannel(setup, id, change.channelId)); break
      case "channel": {
        const channel = change.channel
        if (!isRecord(channel) || typeof channel.channelId !== "string" || !/^UC[\w-]{22}$/.test(channel.channelId) ||
          typeof channel.title !== "string" || (channel.handle !== undefined && typeof channel.handle !== "string")) throw new SessionFailure("unavailable")
        const valid = { channelId: channel.channelId, title: channel.title, ...(typeof channel.handle === "string" ? { handle: channel.handle } : {}) }
        if (change.mode === "allow" || change.mode === "deny") Object.assign(setup, listChannelIn(setup, id, change.mode, valid))
        else Object.assign(setup, addListedChannel(setup, id, valid))
        break
      }
      default: throw new SessionFailure("unavailable")
    }
    await checkSession(session)
    await store.saveAccountSetup(session, setup)
    return { setup }
  }

  async function handle(message: Record<string, unknown>, sender: Sender) {
    const caller = await callerFor(sender, message)
    const fromPage = caller.tabId !== undefined
    if (message.action === "grantSession" && !fromPage) {
      await store.sessionConsent.setValue(store.CONSENT_VERSION)
      await reconcileScripts()
      return view(caller)
    }
    if (message.action === "revokeSession" && !fromPage) {
      await store.sessionConsent.setValue(-1)
      await reconcileScripts()
      return { kind: "revoked" }
    }
    await requireConsent()
    if (message.action === "sessionForTab" && fromPage) return findSession(caller)
    if (message.action === "queueVideo" && caller.tabId !== undefined) {
      if (typeof message.videoId !== "string" || !/^[\w-]{11}$/.test(message.videoId)) throw new SessionFailure("unavailable")
      await requireConsent()
      const results = await browser.scripting.executeScript({ target: { tabId: caller.tabId }, world: "MAIN", func: queueInPage, args: [message.videoId] })
      return { ok: results[0]?.result === true }
    }
    if (message.action === "addVideoToPlaylists" || message.action === "addVideoToShortcutPlaylist") return add(caller, message)
    if (fromPage) throw new SessionFailure("unavailable")
    if (message.action === "fetchPlaylists") return view(caller)
    const session = await snapshotFor(caller, message.session)
    if (message.action === "claimLegacy") return serial(session, async () => {
      const owned = await fetchUserPlaylists(session)
      await checkSession(session)
      return { setup: await store.claimLegacySetup(session, owned) }
    })
    if (message.action === "changeSetup") return serial(session, () => changeSetup(session, message.change))
    if (message.action === "lookUpChannel") return fetchChannel(session, queryFrom(message.query))
    if (message.action === "getChannelForTab") {
      if (message.tabId !== session.tabId || typeof message.videoId !== "string" || !/^[\w-]{11}$/.test(message.videoId)) throw new SessionFailure("unavailable")
      return { channel: await fetchVideoChannel(session, message.videoId) }
    }
    throw new SessionFailure("unavailable")
  }

  browser.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    if (!isRecord(message) || typeof message.action !== "string") return false
    void handle(message, sender).then(sendResponse).catch(error => {
      const code = error instanceof SessionFailure ? error.code : "unavailable"
      sendResponse({ kind: code, error: sessionMessage(code) })
      if (sender.tab?.id !== undefined) void notify(sender.tab.id, sessionMessage(code))
    })
    return true
  })
})
