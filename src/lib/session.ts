import { runPageJob } from "@/page/youtube-session"
import type { PageJob, PageReply, SessionChannel, SessionSnapshot } from "@/lib/session-types"
import * as store from "@/lib/storage"

export type { SessionSnapshot } from "@/lib/session-types"

export type SessionState =
  | { kind: "consent" | "revoked" | "noTab" | "signedOut" | "unavailable" | "accountChanged" }
  | { kind: "ready"; session: SessionSnapshot }

export interface Caller {
  incognito: boolean
  windowId: number
  tabId?: number
}

export class SessionFailure extends Error {
  constructor(public readonly code: string) {
    super(sessionMessage(code))
  }
}

export function sessionMessage(code: string): string {
  switch (code) {
    case "consent": return "Agree to YouTube session access to continue."
    case "revoked": return "YouTube access was revoked. Agree again to resume."
    case "signedOut": return "Sign in on YouTube, then check again."
    case "noTab": return "Open YouTube, then check again."
    case "accountChanged": return "The YouTube account changed. Check again before continuing."
    case "unconfirmed": return "The result could not be confirmed. Check the playlist on YouTube before trying again."
    default: return "YouTube access is unavailable. Reload YouTube, then check again."
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isAccountKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value)
}

export function isSnapshot(value: unknown): value is SessionSnapshot {
  return isRecord(value) && isAccountKey(value.accountKey) &&
    Number.isInteger(value.tabId) && typeof value.tabId === "number" && value.tabId >= 0 &&
    typeof value.incognito === "boolean" && isConsentGeneration(value.consentGeneration)
}

export function isConsentGeneration(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
}

function isChannel(value: unknown): value is SessionChannel {
  return isRecord(value) && typeof value.channelId === "string" && /^UC[\w-]{22}$/.test(value.channelId) &&
    typeof value.title === "string" && (value.handle === undefined || typeof value.handle === "string")
}

export function isPageReply(value: unknown): value is PageReply {
  if (!isRecord(value)) return false
  switch (value.kind) {
    case "account": return value.signedIn === false || (value.signedIn === true && isAccountKey(value.accountKey))
    case "playlists": return isAccountKey(value.accountKey) && Array.isArray(value.playlists) &&
      value.playlists.every(row => isRecord(row) && typeof row.id === "string" &&
        /^[\w-]{1,150}$/.test(row.id) && typeof row.title === "string")
    case "add": return isAccountKey(value.accountKey) && typeof value.alreadyIn === "boolean"
    case "channel": return value.channel === null || isChannel(value.channel)
    case "error": return typeof value.message === "string" && typeof value.code === "string" &&
      ["signedOut", "unavailable", "accountChanged", "failed", "unconfirmed"].includes(value.code)
    default: return false
  }
}

export async function requireConsent(expectedGeneration?: string): Promise<string> {
  const consent = await store.sessionConsent.getValue()
  if (consent !== store.CONSENT_VERSION) throw new SessionFailure(consent === -1 ? "revoked" : "consent")
  const generation = await store.sessionGeneration.getValue()
  if (!isConsentGeneration(generation) || (expectedGeneration !== undefined && generation !== expectedGeneration)) {
    throw new SessionFailure("revoked")
  }
  return generation
}

async function bounded<T>(work: Promise<T>, timeoutMs: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SessionFailure(code)), timeoutMs)
    })])
  } finally {
    clearTimeout(timer)
  }
}

async function execute(tabId: number, job: PageJob, consentGeneration: string, timeoutMs = 12000, expiresAt = Date.now() + 10000): Promise<PageReply> {
  await requireConsent(consentGeneration)
  if (Date.now() >= expiresAt) throw new SessionFailure("unavailable")
  try {
    const results = await bounded(browser.scripting.executeScript({
      target: { tabId }, world: "MAIN", func: runPageJob, args: [job, consentGeneration, expiresAt]
    }), timeoutMs, job.kind === "add" ? "unconfirmed" : "unavailable")
    await requireConsent(consentGeneration)
    const reply: unknown = results[0]?.result
    if (!isPageReply(reply)) throw new SessionFailure(job.kind === "add" ? "unconfirmed" : "unavailable")
    if (reply.kind === "error") throw new SessionFailure(reply.code)
    if ("accountKey" in job && "accountKey" in reply && reply.accountKey !== job.accountKey) {
      throw new SessionFailure("accountChanged")
    }
    return reply
  } catch (error) {
    if (error instanceof SessionFailure) throw error
    throw new SessionFailure(job.kind === "add" ? "unconfirmed" : "unavailable")
  }
}

export async function findSession(caller: Caller): Promise<SessionState> {
  try {
    const consentGeneration = await requireConsent()
    const candidates = (await browser.tabs.query({ url: "https://www.youtube.com/*", discarded: false }))
      .filter(tab => tab.id !== undefined && !tab.discarded && !("frozen" in tab && tab.frozen) &&
        tab.incognito === caller.incognito && (caller.tabId === undefined || tab.id === caller.tabId))
      .sort((a, b) => {
        const active = (tab: typeof a) => tab.id === caller.tabId || (tab.active && tab.windowId === caller.windowId)
        return Number(active(b)) - Number(active(a)) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)
      }).slice(0, 3)
    for (const tab of candidates) {
      if (tab.id === undefined) continue
      try {
        const reply = await execute(tab.id, { kind: "account" }, consentGeneration, 2000)
        if (reply.kind === "account") {
          if (!reply.signedIn) return { kind: "signedOut" }
          return { kind: "ready", session: { tabId: tab.id, accountKey: reply.accountKey, incognito: caller.incognito, consentGeneration } }
        }
      } catch (error) {
        if (error instanceof SessionFailure && ["consent", "revoked", "accountChanged"].includes(error.code)) throw error
      }
    }
    return { kind: candidates.length ? "unavailable" : "noTab" }
  } catch (error) {
    if (error instanceof SessionFailure && error.code === "consent") return { kind: "consent" }
    if (error instanceof SessionFailure && error.code === "revoked") return { kind: "revoked" }
    if (error instanceof SessionFailure && error.code === "accountChanged") return { kind: "accountChanged" }
    return { kind: "unavailable" }
  }
}

export async function checkSession(session: SessionSnapshot): Promise<void> {
  await requireConsent(session.consentGeneration)
  const tab = await browser.tabs.get(session.tabId).catch(() => null)
  if (!tab || tab.incognito !== session.incognito || tab.discarded || ("frozen" in tab && tab.frozen) ||
    !tab.url?.startsWith("https://www.youtube.com/")) throw new SessionFailure("unavailable")
  const reply = await execute(session.tabId, { kind: "account" }, session.consentGeneration, 2000)
  if (reply.kind !== "account" || !reply.signedIn || reply.accountKey !== session.accountKey) {
    throw new SessionFailure("accountChanged")
  }
}

export async function runSessionJob(session: SessionSnapshot, job: Exclude<PageJob, { kind: "account" }>, expiresAt?: number): Promise<PageReply> {
  const deadline = expiresAt ?? Date.now() + 10000
  await checkSession(session)
  if ("accountKey" in job && job.accountKey !== session.accountKey) throw new SessionFailure("accountChanged")
  return execute(session.tabId, job, session.consentGeneration, 12000, deadline)
}

export function setPageAccess(enabled: boolean, consentGeneration: string): void {
  Object.defineProperty(window, "__ytptSessionGeneration", { value: consentGeneration, writable: true, configurable: true })
  Object.defineProperty(window, "__ytptSessionAccess", { value: enabled, writable: true, configurable: true })
}

const SCRIPT_ID = "ytpt-youtube"
const CONTENT_FILE = "/content-scripts/youtube.js"
let registration: Promise<void> = Promise.resolve()

export function reconcileScripts(): Promise<void> {
  registration = registration.catch(() => {}).then(async () => {
    const consent = await store.sessionConsent.getValue()
    const consentGeneration = await store.sessionGeneration.getValue()
    const registered = await browser.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })
    if (consent !== store.CONSENT_VERSION) {
      if (!registered.length && consent !== -1) return
      if (registered.length) await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] })
      const tabs = await browser.tabs.query({ url: "https://www.youtube.com/*", discarded: false })
      await Promise.all(tabs.map(async tab => {
        if (tab.id === undefined || tab.discarded) return
        await browser.scripting.executeScript({
          target: { tabId: tab.id }, world: "MAIN", func: setPageAccess, args: [false, consentGeneration]
        })
      }))
      return
    }
    await requireConsent(consentGeneration)
    if (!registered.length) {
      await browser.scripting.registerContentScripts([{
        id: SCRIPT_ID, matches: ["https://www.youtube.com/*"], js: [CONTENT_FILE],
        runAt: "document_idle", persistAcrossSessions: false
      }])
    }
    try {
      await requireConsent(consentGeneration)
      const tabs = await browser.tabs.query({ url: "https://www.youtube.com/*", discarded: false })
      for (const tab of tabs) {
        if (tab.id === undefined || tab.discarded) continue
        await requireConsent(consentGeneration)
        await browser.scripting.executeScript({
          target: { tabId: tab.id }, world: "MAIN", func: setPageAccess, args: [true, consentGeneration]
        })
        if ("frozen" in tab && tab.frozen) continue
        await requireConsent(consentGeneration)
        const alive: unknown = await browser.tabs.sendMessage(tab.id, { action: "sessionContentAlive" }).catch(() => null)
        if (isRecord(alive) && alive.alive === true) continue
        await requireConsent(consentGeneration)
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: [CONTENT_FILE] }).catch(() => {})
      }
    } catch (error) {
      if (await store.sessionConsent.getValue() !== store.CONSENT_VERSION) {
        await browser.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => {})
      }
      throw error
    }
  })
  return registration
}

export async function queueInPage(videoId: string, consentGeneration: string, expiresAt: number): Promise<boolean> {
  const active = () => !("__ytptSessionAccess" in window && window.__ytptSessionAccess === false) &&
    "__ytptSessionGeneration" in window && window.__ytptSessionGeneration === consentGeneration && Date.now() < expiresAt
  if (!active() || !/^[\w-]{11}$/.test(videoId)) return false
  const app = document.querySelector("ytd-app")
  if (!app || !("resolveCommand" in app) || typeof app.resolveCommand !== "function") return false
  const player = document.querySelector("ytd-miniplayer")
  const open = player && "active" in player && player.active === true
  const command = {
    videoIds: [videoId], listType: "PLAYLIST_EDIT_LIST_TYPE_QUEUE",
    ...(!open ? { openMiniplayer: true, onCreateListCommand: {
      createPlaylistServiceEndpoint: { videoIds: [videoId], params: "CAQ%3D" }
    } } : {})
  }
  try {
    app.resolveCommand({ signalServiceEndpoint: { signal: "CLIENT_SIGNAL", actions: [{ addToPlaylistCommand: command }] } })
    if (open) return true
    const until = Date.now() + 600
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 50))
      if (!active()) return false
      const current = document.querySelector("ytd-miniplayer")
      if (current && "active" in current && current.active === true) return true
    }
    return false
  } catch {
    return false
  }
}
