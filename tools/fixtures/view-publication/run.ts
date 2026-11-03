import { publicationWorld, publicationSeed, drain } from "./harness"
import { a, b } from "../tabs/harness"
import { alpha, beta, video } from "../tab-projection/harness"
import type { JsonObject } from "../../../src/shared/contracts/json"

export async function runViewPublicationConsumer() {
  const seed = publicationSeed()
  const document = (data: JsonObject, gen: string) => ({ v: 1, gen, at: 1, by: "synthetic", data })
  seed.local["doc:settings"] = document({ autoAdd: { on: true } }, "settings")
  seed.local[`doc:setup:${a}`] = document({ label: { name: "Alpha" }, autoAdd: [{ pl: alpha, takes: "both" }] }, "setup-alpha")
  seed.local[`doc:setup:${b}`] = document({ label: { name: "Beta" }, quickSave: beta }, "setup-beta")
  for (const name of Object.keys(seed.local)) if (name.startsWith("doc:filter:")) delete seed.local[name]
  seed.local[`doc:filter:${a}:${alpha}`] = document({ mode: "allow", on: true, channels: [] }, "filter")
  const h = await publicationWorld(seed)
  const sorted = (rows: typeof h.sent) =>
    structuredClone(rows)
      .map(row => {
        const { site, build, ...info } = row.view
        return { ...row, view: { site, build, ...info } }
      })
      .sort((left, right) => left.tabId - right.tabId)
  try {
    const filterResult = await h.filter(false)
    await drain()
    await h.advance(249)
    const beforeDeadline = sorted(h.sent)
    await h.advance(1)
    const account = sorted(h.sent)
    const pauseResult = await h.sessionChange([{ kind: "pause", paused: true }])
    await drain()
    await h.advance(250)
    const shared = sorted(h.sent.slice(account.length))
    const privateOrigin = { kind: "tab", tabId: 9, incognito: true } as const
    const sessionBeforePrivate = JSON.stringify(h.removal.state().session)
    let start = h.sent.length
    const privateChangeResult = await h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, privateOrigin)
    await drain()
    await h.advance(249)
    const privateBeforeDeadline = sorted(h.sent.slice(start))
    await h.advance(1)
    const privateChanged = sorted(h.sent.slice(start))
    start = h.sent.length
    const privateNoopResult = await h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, privateOrigin)
    await drain()
    await h.advance(250)
    const privateAfterNoop = sorted(h.sent.slice(start))
    const privateUndoResult = await h.flow.skip({ kind: "unskip", acct: a, video }, privateOrigin)
    await drain()
    await h.advance(250)
    const privateUnskipped = sorted(h.sent.slice(start))
    const privateSessionUnchanged = JSON.stringify(h.removal.state().session) === sessionBeforePrivate
    start = h.sent.length
    const normalSkipResult = await h.flow.skip({ kind: "skip", acct: a, video, playlists: [alpha] }, { kind: "tab", tabId: 1, incognito: false })
    await drain()
    await h.advance(250)
    const normalSkips = sorted(h.sent.slice(start))
    const nativeTargets = h.nativeTargets().sort((left, right) => left - right)
    h.publisher.dispose()
    return {
      name: "account-and-shared",
      syntheticNativePorts: true,
      syntheticHealthFacts: true,
      filterResult,
      pauseResult: pauseResult.kind,
      beforeDeadline,
      account,
      shared,
      nativeTargets,
      privateChangeResult,
      privateBeforeDeadline,
      privateChanged,
      privateNoopResult,
      privateAfterNoop,
      privateUndoResult,
      privateUnskipped,
      privateSessionUnchanged,
      normalSkipResult,
      normalSkips,
      cleanup: { subscriptions: { ...h.subscriptions }, deadlines: h.clock.pending }
    }
  } finally {
    await h.dispose()
  }
}
if (import.meta.main) process.stdout.write(JSON.stringify(await runViewPublicationConsumer()) + "\n")
