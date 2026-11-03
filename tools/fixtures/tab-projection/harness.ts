import { createLocalFilterWriter } from "../../../src/background/store/local-filter-writer"
import { isAccountKey, isPlaylistId, isVideoId } from "../../../src/shared/model"
import type { JsonObject } from "../../../src/shared/contracts/json"
import { createRemovalHarness, removalFixture, type RemovalFixtureState } from "../account-removal-execution/run"

function brand<T>(guard: (value: unknown) => value is T, value: string): T {
  if (!guard(value)) throw Error("Invalid synthetic identifier")
  return value
}
export const a = brand(isAccountKey, "AAAAAAAAAAAAAAAA"),
  b = brand(isAccountKey, "BBBBBBBBBBBBBBBB")
export const alpha = brand(isPlaylistId, "PL_alpha"),
  beta = brand(isPlaylistId, "PL_beta")
export const video = brand(isVideoId, "aaaaaaaaaaa"),
  otherVideo = brand(isVideoId, "bbbbbbbbbbb")
export const signedIn = { private: false, account: { kind: "signed-in", acct: a } } as const
export const normalWindow = { kind: "normal-window", windowId: 1, incognito: false } as const
export const origin = { kind: "ui", windowId: 1, incognito: false } as const
export function document(data: JsonObject, version = 1): JsonObject {
  return { v: version, gen: "fixture", at: 7, by: "fixture", envelope: { neverSend: b }, data }
}
export function projectionSeed(): RemovalFixtureState {
  const inherited = removalFixture()
  const local: JsonObject = {
    schema: 1,
    device: { id: "never-send-device", consent: { v: 1, at: 1 }, syncOn: false, pickerSortAZ: true, neverSend: "device-extension" },
    lastAccount: b,
    sync: inherited.local.sync!,
    "doc:settings": document({
      autoAdd: { on: true, pct: 73, neverSend: b },
      shortcuts: { on: true, list: [{ id: "orig01", label: "Alpha shortcut", key: null, watchLaterOnEveryAccount: false, neverSend: b }] },
      neverSend: b
    }),
    [`doc:setup:${a}`]: document({
      label: { name: "Alpha", handle: "@alpha", neverSend: b },
      autoAdd: [{ pl: alpha, takes: "both", pct: 24, neverSend: b }],
      targets: { orig01: beta, gone01: "PL_stale" },
      quickSave: alpha,
      marks: { [alpha]: "missing" },
      neverSend: b
    }),
    [`doc:setup:${b}`]: document({ label: { name: "Beta" }, musicSave: beta }),
    [`doc:filter:${a}:${alpha}`]: document({ mode: "allow", on: true, channels: [["UCAAAAAAAAAAAAAAAAAAAAAA", "Alpha channel", "@alpha", "never-send"]], neverSend: b }),
    [`doc:filter:${a}:${beta}`]: { v: 1, gen: "deleted", at: 1, by: "fixture", deleted: true },
    [`doc:filter:${b}:PL_bad`]: { v: 1, gen: "bad", at: 1, by: "fixture", data: "malformed-foreign-document" },
    [`doc:filter:${b}:PL_new`]: document({ unrelated: true }, 20),
    recoveryExtension: { neverSend: b }
  }
  const session: JsonObject = {
    ...inherited.session,
    tabs: { "1": { site: "www", signedIn: true, acct: a, at: 4 }, "2": { site: "music", signedIn: true, acct: b, at: 5 } },
    paused: true,
    [`skips:${a}`]: { [video]: [alpha], ccccccccccc: "all" },
    [`skips:${b}`]: { [otherVideo]: [beta] },
    [`cooldown:${a}`]: 12,
    [`cooldown:${b}`]: 34,
    recent: [
      { acct: a, playlist: alpha, video, at: 5 },
      { acct: b, playlist: beta, video: otherVideo, at: 6 }
    ],
    shown: { v: 1, global: { once: ["global-only"] }, accounts: { [a]: { once: ["alpha-only"] }, [b]: { once: ["beta-only"] } } },
    gather: {
      v: 1,
      global: {},
      accounts: {
        [a]: { last: [{ id: "g-alpha", seq: 1, at: 4, auto: false, to: "playlist", acct: a, playlist: alpha, count: 1, added: [{ video, setVideoId: null }] }] },
        [b]: { last: [{ id: "g-beta", seq: 2, at: 5, auto: true, to: "playlist", acct: b, playlist: beta, count: 1, added: [{ video: otherVideo, setVideoId: null }] }] }
      }
    }
  }
  return { local, session, sync: inherited.sync }
}
export function deferred() {
  let release = () => {},
    enter = () => {}
  const pending = new Promise<void>(done => {
    release = done
  })
  const entered = new Promise<void>(done => {
    enter = done
  })
  return {
    release,
    entered,
    async wait() {
      enter()
      await pending
    }
  }
}
export async function settle() {
  for (let n = 0; n < 80; n++) await Promise.resolve()
}
export function projectionWorld(initial = projectionSeed()) {
  const removal = createRemovalHarness(initial)
  const native = removal.deps.removal
  if (native.kind !== "fixture") throw Error("Missing fixture session")
  let boundary: (kind: "local" | "session") => Promise<void> = async () => {}
  let clockReads = 0
  const deps = {
    ...removal.deps,
    local: {
      ...removal.deps.local,
      async get(keys: readonly string[] | null) {
        const answer = await removal.deps.local.get(keys)
        await boundary("local")
        return answer
      }
    },
    removal: {
      ...native,
      session: {
        ...native.session,
        async get() {
          const answer = await native.session.get()
          await boundary("session")
          return answer
        }
      }
    },
    syncClock: {
      ...removal.deps.syncClock,
      now() {
        clockReads++
        return removal.deps.syncClock.now()
      },
      wallNow() {
        clockReads++
        return removal.deps.syncClock.wallNow()
      }
    }
  }
  const owner = createLocalFilterWriter(deps)
  return {
    owner,
    removal,
    deps,
    boundary(fn: typeof boundary) {
      boundary = fn
    },
    get clockReads() {
      return clockReads
    },
    writes: () => removal.io.filter(row => row.phase === "invoked" && /^(local|session|sync)\.(set|remove)/.test(row.kind)),
    syncReads: () => removal.io.filter(row => row.phase === "invoked" && row.kind === "sync.get")
  }
}
