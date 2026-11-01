import { choiceHarness, acct, one, two, captured, change, setupKey, stamp } from "./harness"
import { onboardingSender, check } from "../first-run-backend/harness"
export async function runAutoAddChoiceConsumer() {
  const h = await choiceHarness(), rows: string[] = []
  const backend = h.view.backend
  const read = async (playlist = one) => captured(await backend.change({ kind: "auto-add-read", acct, playlist }))
  const record = (name: string, result: unknown) => rows.push(JSON.stringify({ case: name, result }))
  try {
    const first = await read(), independent = await read(two)
    record("fresh-selection", await backend.change(change(first, { kind: "auto-add", expected: false, chosen: true })))
    record("independent-selection", await backend.change(change(independent, { kind: "auto-add", expected: false, chosen: true })))
    const options = await read()
    record("takes", await backend.change(change(options, { kind: "takes", expected: "videos", takes: "both" })))
    record("percentage", await backend.change(change(options, { kind: "percentage", expected: null, pct: 35 })))
    record("stale-field", await backend.change(change(options, { kind: "takes", expected: "videos", takes: "shorts" })))
    const keep = `doc:filter:${acct}:${one}`
    h.store.foreign(records => { records[keep] = { ...stamp, data: { mode: "allow", on: true, channels: [] } } })
    record("untick-kept-filter", await backend.change(change(await read(), { kind: "auto-add", expected: true, chosen: false })))
    record("retick-kept-filter", await backend.change(change(await read(), { kind: "auto-add", expected: false, chosen: true })))
    const filter = h.store.records()[keep]
    check(JSON.stringify(filter) === JSON.stringify({ ...stamp, data: { mode: "allow", on: true, channels: [] } }), "retick preserves complete kept filter")
    h.store.foreign(records => { delete records[keep]; records[`cache:${acct}`] = { keep: true }; records[`progress:${acct}:0`] = { keep: true } })
    record("untick-first", await backend.change(change(await read(), { kind: "auto-add", expected: true, chosen: false })))
    const beforeRemoval = await read(two)
    record("last-choice-removal", await backend.change(change(beforeRemoval, { kind: "auto-add", expected: true, chosen: false })))
    check(!Object.hasOwn(h.store.records(), setupKey), "last choice invokes actual Setup removal")
    check(!Object.hasOwn(h.store.records(), `cache:${acct}`) && !Object.hasOwn(h.store.records(), `progress:${acct}:0`), "actual removal clears cache and progress")
    check(!Object.hasOwn(h.removal.session(), `skips:${acct}`), "actual removal clears account session")
    const native = onboardingSender(11)
    const privateSender = { ...native, tab: { ...native.tab, incognito: true } }
    h.privacy.set(1, true)
    const privateView = h.openView(privateSender)
    record("private-refusal", await privateView.backend.change({ kind: "auto-add-read", acct, playlist: one }))
    h.privacy.set(1, false)
    record("recreate", await backend.change(change(await read(two), { kind: "auto-add", expected: false, chosen: true })))
    record("stale-account", await backend.change(change(beforeRemoval, { kind: "auto-add", expected: true, chosen: false })))
    const closed = h.stats()
    check(closed.chooserCalls === 0 && closed.accountReads === 0 && closed.playlistReads === 0, "choice path sends no video or chooser operation")
  } finally { await h.dispose() }
  const closed = h.stats()
  rows.push(JSON.stringify({ case: "closed", nativeListeners: closed.nativeListeners, localListeners: closed.localListeners, deadlines: closed.deadlines }))
  return rows
}

if (import.meta.main) for (const row of await runAutoAddChoiceConsumer()) console.log(row)
