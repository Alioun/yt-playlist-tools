import { createFirstRunHarness, accountKey, playlistId, check } from "../first-run-backend/harness"
import type { agreementHarness } from "../claim-transaction/run"
import { accountRemovalLocalName, type AccountRemovalHost } from "../../../src/background/store/account-removal-execution"
import type { JsonObject } from "../../../src/shared/contracts/json"
import type { AutoAddChoiceChange, AutoAddEdit, AutoAddReadAnswer } from "../../../src/shared/contracts/auto-add-choice"

export const acct = accountKey(), one = playlistId("PL_one"), two = playlistId("PL_two")
export const ui = { kind: "ui", windowId: 1, incognito: false } as const
export const setupKey = `doc:setup:${acct}`
export const stamp = { v: 1, gen: "original", at: 1, by: "fixture" }
export function seed(setup?: JsonObject): JsonObject {
  return {
    schema: 1,
    device: { id: "fixture", consent: { v: 1, at: 1 }, syncOn: false, legacyCleared: true }, lastAccount: acct,
    sync: { joined: null, pushed: {}, status: "off", editedSinceOff: false, everEdited: false },
    "doc:settings": { ...stamp, data: {} }, unclaimed: null,
    ...(setup ? { [setupKey]: { ...stamp, data: setup } } : {}),
    unrelated: { keep: true }
  }
}
export function removalPorts(store: ReturnType<typeof agreementHarness>, initialSession: JsonObject = {}) {
  let session = structuredClone(initialSession)
  const removed: string[] = [], sessionWrites: unknown[] = []
  const host: AccountRemovalHost = {
    kind: "fixture",
    async removeLocal(keys) {
      store.foreign(records => {
        for (const key of keys) {
          const owner = key.kind === "continuation" ? acct : key.kind === "document" ? key.key.acct : key.acct
          const name = accountRemovalLocalName(key, owner)
          removed.push(name)
          delete records[name]
        }
      })
    },
    session: {
      async get() { return structuredClone(session) },
      async set(items) { sessionWrites.push(structuredClone(items)); Object.assign(session, structuredClone(items)) },
      async remove(keys) { for (const key of keys) { sessionWrites.push({ remove: key }); delete session[`${key.kind}:${key.acct}`] } }
    }
  }
  return { host, removed, sessionWrites, session: () => structuredClone(session) }
}
export async function choiceHarness(records = seed()) {
  let removal: ReturnType<typeof removalPorts> | undefined
  const h = await createFirstRunHarness({ records, removal(store) {
    removal = removalPorts(store, { [`skips:${acct}`]: { aaaaaaaaaaa: [one] }, [`cooldown:${acct}`]: 10,
      shown: { v: 1, global: { keep: true }, accounts: { [acct]: { shown: true } } }, unknown: { keep: true } })
    return removal.host
  } })
  check(removal, "actual removal ports installed")
  const view = h.openView()
  return { ...h, view, removal }
}
export function captured(answer: AutoAddReadAnswer): Extract<AutoAddReadAnswer, { kind: "value" }> {
  check(answer.kind === "value", "canonical auto-add capture available")
  return answer
}
export function change(answer: Extract<AutoAddReadAnswer, { kind: "value" }>, edit: AutoAddEdit): AutoAddChoiceChange {
  return { kind: "auto-add-choice", acct: answer.acct, playlist: answer.playlist, lifetime: answer.lifetime, edit }
}
