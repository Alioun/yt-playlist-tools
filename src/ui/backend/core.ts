import { changeFeatureFromClick } from "./shared-settings"
import { createKeySettingsSource } from "./key-settings"
import { isFeatureSettingChange, isSharedSettingChange, type FeatureSettingChange, type FeatureSettingAnswer, type SharedSettingChange, type SharedSettingAnswer } from "../../shared/contracts/shared-settings"
import { isKeySettingChange, type KeySettingChange, type KeySettingAnswer } from "../../shared/contracts/key-settings"
import { createPlaylistOperation } from "./playlist-list/operation"
import { uiContract, type UiMessages } from "../../shared/contracts/ui"
import { isCreationId, type UiCreationAnswer, type UiNewPlaylist } from "../../shared/contracts/ui-playlists"
import { objectShape } from "../../shared/contracts/object-shape"
import type { RpcOutcome } from "../../shared/rpc/rpc"
import { confirmsSelection, isChangePayload, type AgreeChange, type AgreementAnswer, type DestinationAnswer, type DestinationChange, type Change } from "../../shared/contracts/first-run"
import { firstRunKeys, readFirstRunSnapshot, type ReadScope, type UiSnapshot } from "../../shared/model/first-run-view"
import { createRpcCaller } from "../../shared/rpc/rpc"
import type { Backend, BackendOptions, BackendPorts, LocalListener, PageEvent, UiEvent } from "./backend"
import { pageViewKeeps, readPageView, type PageView } from "../../shared/model/page-view"
import { isGatherPush, type GatherPush } from "../../shared/contracts/ui-gather"

import { confirmsAutoAdd, type AutoAddReadChange, type AutoAddReadAnswer, type AutoAddChoiceChange, type AutoAddChoiceAnswer } from "../../shared/contracts/auto-add-choice"

type View = {
  readonly scope: ReadScope | undefined
  readonly keys: readonly string[]
  readonly listeners: Set<(event: UiEvent) => void>
  epoch: number
  serial: number
  notified: number
  pending: Promise<UiSnapshot> | undefined
}
const disposedView = (): UiSnapshot => ({ kind: "unavailable", reason: "disposed" })

export function createBackend(ports: BackendPorts, options: BackendOptions): Backend {
  const keys = createKeySettingsSource(ports.local)
  const caller = crypto.randomUUID()
  const rpc = createRpcCaller<UiMessages>({ async send(message) {
    if (!objectShape(message, { v: v => typeof v === "number", build: v => v === options.build,
      id: v => typeof v === "string", kind: v => typeof v === "string", payload: () => true })) throw Error("Invalid UI envelope")
    const id = message.id, wireId = `${caller}:${id}`
    const raw = await ports.send({ ...message, id: wireId })
    if (objectShape(raw, { v: v => typeof v === "number", build: v => v === options.build,
      id: v => v === wireId, kind: v => typeof v === "string", result: () => true })
      || objectShape(raw, { v: v => typeof v === "number", build: v => v === options.build,
        id: v => v === wireId, kind: v => typeof v === "string", failure: v => v === "receiver" })) return { ...raw, id }
    return raw
  } }, { ...options, contract: uiContract })
  const creations = new Set<() => void>()
  const playlistLists = new Map<() => void, Parameters<Backend["playlistList"]>[0]>()
  const call: Backend["call"] = (kind, args) => rpc.call(kind, {
    ...(options.windowId === undefined ? {} : { windowId: options.windowId }), ...args
  })
  const views = new Map<string, View>()
  const pageListeners = new Set<(event: PageEvent) => void>()
  let pageEpoch = 0
  let disposed = false
  let listening = false

  function readPage(): Promise<PageView> {
    if (disposed) return Promise.resolve({ kind: "unavailable", reason: "disposed" })
    return Promise.resolve().then(() => ports.local.all())
      .then(records => readPageView(Object.fromEntries(Object.entries(records).filter(([key]) => pageViewKeeps(key)))))
      .catch((): PageView => ({ kind: "unavailable", reason: "read" }))
      .then(view => disposed ? { kind: "unavailable", reason: "disposed" } : view)
  }
  function refreshPage() {
    const epoch = ++pageEpoch
    void readPage().then(view => {
      if (disposed || epoch !== pageEpoch) return
      for (const listener of [...pageListeners]) {
        if (!pageListeners.has(listener)) continue
        try { listener({ kind: "page", view }) } catch {}
      }
    })
  }
  function listen() {
    if (listening) return
    ports.local.onChanged.addListener(changed)
    listening = true
  }

  function view(scope?: ReadScope): View {
    const key = scope?.acct ?? ""
    let entry = views.get(key)
    if (!entry) {
      const captured = scope ? { acct: scope.acct } : undefined
      entry = { scope: captured, keys: firstRunKeys(captured), listeners: new Set(), epoch: 0, serial: 0, notified: -1, pending: undefined }
      views.set(key, entry)
    }
    return entry
  }
  function read(entry: View): Promise<UiSnapshot> {
    if (disposed) return Promise.resolve(disposedView())
    const serial = ++entry.serial, epoch = entry.epoch
    const pending = Promise.resolve().then(() => ports.local.get(entry.keys)).then(records => readFirstRunSnapshot(records, entry.scope),
      (): UiSnapshot => ({ kind: "unavailable", reason: "read" })).catch((): UiSnapshot => ({ kind: "unavailable", reason: "read" })).then(snapshot => {
      if (disposed) return disposedView()
      if (entry.serial !== serial && entry.pending) return entry.pending
      if (entry.epoch !== epoch) return read(entry)
      return snapshot
    })
    entry.pending = pending
    return pending
  }
  const changed: LocalListener = (changes, area) => {
    if (disposed || area !== "local") return
    if (pageListeners.size && Object.keys(changes).some(pageViewKeeps)) refreshPage()
    for (const [stop, request] of [...playlistLists]) {
      if (Object.hasOwn(changes, "device") || Object.hasOwn(changes, "schema") || Object.hasOwn(changes, `doc:setup:${request.acct}`)) stop()
    }
    for (const entry of views.values()) {
      if (!entry.keys.some(key => Object.hasOwn(changes, key))) continue
      const epoch = ++entry.epoch
      if (!entry.listeners.size) continue
      void read(entry).then(snapshot => {
        if (disposed || epoch !== entry.epoch || entry.notified === epoch) return
        entry.notified = epoch
        for (const listener of [...entry.listeners]) {
          if (!entry.listeners.has(listener) || disposed) continue
          try { listener({ kind: "view", snapshot }) } catch {}
        }
      })
    }
  }
  function removeUnusedListener() {
    if (listening && playlistLists.size === 0 && pageListeners.size === 0 && ![...views.values()].some(entry => entry.listeners.size)) {
      listening = false
      ports.local.onChanged.removeListener(changed)
    }
  }
  function watch(fn: (event: UiEvent) => void, scope?: ReadScope) {
    if (disposed) return () => {}
    const entry = view(scope)
    const listener = (event: UiEvent) => fn(event)
    entry.listeners.add(listener)
    listen()
    let active = true
    return () => {
      if (!active) return
      active = false
      entry.listeners.delete(listener)
      removeUnusedListener()
    }
  }
  function watchPage(fn: (event: PageEvent) => void) {
    if (disposed) return () => {}
    const listener = (event: PageEvent) => fn(event)
    pageListeners.add(listener)
    listen()
    return () => {
      if (!pageListeners.delete(listener)) return
      removeUnusedListener()
    }
  }
  function change(change: AgreeChange): Promise<AgreementAnswer>
  function change(change: DestinationChange): Promise<DestinationAnswer>
  function change(change: AutoAddReadChange): Promise<AutoAddReadAnswer>
  function change(change: AutoAddChoiceChange): Promise<AutoAddChoiceAnswer>
  function change(change: FeatureSettingChange): Promise<FeatureSettingAnswer>
  function change(change: SharedSettingChange): Promise<SharedSettingAnswer>
  function change(change: KeySettingChange): Promise<KeySettingAnswer>
  async function change(change: Change): Promise<AgreementAnswer | DestinationAnswer | AutoAddReadAnswer | AutoAddChoiceAnswer | FeatureSettingAnswer | SharedSettingAnswer | KeySettingAnswer> {
    const payload = { change, ...(options.windowId === undefined ? {} : { windowId: options.windowId }) }
    if (!isChangePayload(payload)) return change.kind === "first-run-agree"
      ? { kind: "not-agreed", attempt: change.attempt, reason: "invalid" } : { kind: "refused", reason: "invalid" }
    const result = await rpc.call("ui.change", payload)
    if (result.kind !== "answered" || disposed) return change.kind === "first-run-agree"
      ? { kind: "not-agreed", attempt: change.attempt, reason: "unavailable" } : { kind: "refused", reason: "unavailable" }
    if (change.kind === "first-run-agree") {
      if (result.result.kind !== "agreement" || !confirmsSelection(change, result.result.outcome)) {
        return { kind: "not-agreed", attempt: change.attempt, reason: "unconfirmed" }
      }
      return result.result.outcome
    }
    if (change.kind === "auto-add-read") {
      if (result.result.kind !== "auto-add-read") return { kind: "refused", reason: "unconfirmed" }
      const answer = result.result.outcome
      if (answer.kind === "value" && (answer.acct !== change.acct || answer.playlist !== change.playlist)) return { kind: "refused", reason: "unconfirmed" }
      return answer
    }
    if (change.kind === "auto-add-choice") {
      if (result.result.kind !== "auto-add-choice" || !confirmsAutoAdd(change, result.result.outcome)) return { kind: "refused", reason: "unconfirmed" }
      return result.result.outcome
    }
    if (isFeatureSettingChange(change)) {
      if (result.result.kind !== "feature-setting" || result.result.outcome.kind === "confirmed" && JSON.stringify(result.result.outcome.change) !== JSON.stringify(change)) return { kind: "refused", reason: "unconfirmed" }
      return result.result.outcome
    }
    if (isSharedSettingChange(change)) {
      if (result.result.kind !== "shared-setting" || result.result.outcome.kind === "confirmed" && JSON.stringify(result.result.outcome.change) !== JSON.stringify(change)) return { kind: "refused", reason: "unconfirmed" }
      return result.result.outcome
    }
    if (isKeySettingChange(change)) {
      if (result.result.kind !== "key-setting") return { kind: "refused", reason: "unconfirmed" }
      const answer = result.result.outcome
      if (answer.kind === "confirmed" && JSON.stringify(answer.change) !== JSON.stringify(change) || answer.kind === "added" && change.kind !== "shortcut-add" ||
        answer.kind === "removed" && (change.kind !== "shortcut-remove" || change.id !== answer.id) || answer.kind === "conflict" && change.kind !== "key") return { kind: "refused", reason: "unconfirmed" }
      return answer
    }
    if (change.kind !== "setup-destination") return { kind: "refused", reason: "invalid" }
    if (result.result.kind !== "destination" || result.result.outcome.kind === "confirmed" && result.result.outcome.playlist !== change.playlist) {
      return { kind: "refused", reason: "unconfirmed" }
    }
    return result.result.outcome
  }
  function creation(request: Parameters<Backend["creation"]>[0]): ReturnType<Backend["creation"]> {
    const candidate = crypto.randomUUID()
    if (!isCreationId(candidate)) throw Error("Invalid creation identity")
    const operation = candidate
    const window = options.windowId === undefined ? {} : { windowId: options.windowId }
    let active = !disposed
    let submission: Promise<RpcOutcome<UiCreationAnswer>> | undefined
    const closed = (): RpcOutcome<UiCreationAnswer> => ({ kind: "failed", failure: "disposed" })
    const opened = active ? rpc.call("ui.create", { action: "open", operation, ...request, ...window }) : Promise.resolve(closed())
    async function current(work: Promise<RpcOutcome<UiCreationAnswer>>) {
      const answer = await work
      return active && !disposed ? answer : closed()
    }
    function stop() {
      if (!active) return
      active = false
      creations.delete(stop)
      void rpc.call("ui.create", { action: "release", operation, ...window })
    }
    if (active) creations.add(stop)
    return {
      submit(playlist: UiNewPlaylist) {
        if (!active || disposed) return Promise.resolve(closed())
        if (submission) return submission
        const captured = { title: playlist.title, privacy: playlist.privacy,
          ...(playlist.videoId === undefined ? {} : { videoId: playlist.videoId }) }
        submission = (async (): Promise<RpcOutcome<UiCreationAnswer>> => {
          const ready = await opened
          if (!active || disposed) return closed()
          if (ready.kind !== "answered" || ready.result.kind !== "opened" || ready.result.operation !== operation) return ready
          return current(rpc.call("ui.create", { action: "submit", operation, ...captured, ...window }))
        })()
        void submission.then(answer => {
          if (active && answer.kind === "answered" && answer.result.kind === "invalid") submission = undefined
        })
        return submission
      },
      status() { return !active || disposed ? Promise.resolve(closed()) : current(rpc.call("ui.create", { action: "status", operation, ...window })) },
      dispose: stop
    }
  }
  const gatherListeners = new Set<(push: GatherPush) => boolean>()
  let stopPushes: (() => void) | null = null
  function watchGather(fn: (push: GatherPush) => boolean) {
    if (disposed || !ports.pushes) return () => {}
    gatherListeners.add(fn)
    stopPushes ??= ports.pushes.listen(message => {
      if (disposed || !isGatherPush(message, options.build)) return undefined
      let shown = false
      for (const listener of [...gatherListeners]) { try { shown = listener(message.payload) || shown } catch {} }
      return shown ? { shown: true } : undefined
    })
    return () => {
      gatherListeners.delete(fn)
      if (!gatherListeners.size) { stopPushes?.(); stopPushes = null }
    }
  }
  function playlistList(request: Parameters<Backend["playlistList"]>[0]) {
    const enabled = !disposed && playlistLists.size < 256
    const operation = createPlaylistOperation(call, { ...request }, enabled ? "ready" : disposed ? "disposed" : "capacity", () => {
      playlistLists.delete(operation.dispose)
      removeUnusedListener()
    })
    if (enabled) {
      playlistLists.set(operation.dispose, { ...request })
      listen()
    }
    return operation
  }
  function dispose() {
    if (disposed) return
    for (const stop of [...playlistLists.keys()]) stop()
    for (const stop of [...creations]) stop()
    disposed = true
    keys.dispose()
    rpc.dispose()
    for (const entry of views.values()) entry.listeners.clear()
    pageListeners.clear()
    gatherListeners.clear()
    stopPushes?.()
    stopPushes = null
    removeUnusedListener()
  }
  const access: Backend["access"] = {
    has: site => disposed ? Promise.resolve(false) : ports.access.has(site),
    request: site => disposed ? Promise.resolve(false) : ports.access.request(site),
    hasBrowserMenu: () => disposed ? Promise.resolve(false) : ports.access.hasBrowserMenu(),
    requestCombined: needs => disposed ? Promise.resolve({ music: false, browserMenu: false }) : ports.access.requestCombined(needs)
  }
  const changeFeatureSetting: Backend["changeFeatureSetting"] = (requestedChange, settings) => changeFeatureFromClick({
    access, active: () => !disposed,
    async send(requested) {
      return change(requested)
    }
  }, requestedChange, settings)
  return { keys, load: scope => read(view(scope)), watch, loadPage: readPage, watchPage, change, changeFeatureSetting, call, watchGather, playlistList, creation, access, dispose,
    clearAll: payload => disposed ? Promise.resolve({ kind: "failed", failure: "disposed" }) : rpc.call("ui.clearAll", payload) }
}
