import { createFirstRunHarness, check, onboardingSender, accountKey, playlistId, turns } from "./harness"
import type { UiEvent } from "../../../src/ui/backend/backend"

export async function runFirstRunBackendConsumer(): Promise<readonly string[]> {
  let h = await createFirstRunHarness({ records: { schema: 1, device: { id: "fixture-device", consent: null, syncOn: false } } })
  const output: string[] = []
  try {
    const before = { writes: h.store.batches.length, sync: h.stats().syncReads, requests: h.requests.length, listeners: h.stats().nativeListeners }
    let first = h.openView(), second = h.openView(onboardingSender(11))
    check(h.store.batches.length === before.writes && h.stats().syncReads === before.sync && h.requests.length === before.requests, "mounting is inert")
    check(h.stats().nativeListeners === before.listeners, "UI callers install no inbound listeners")
    const initial = await first.backend.load()
    check(initial.kind === "snapshot" && initial.device.kind === "current" && initial.device.consent === "required", "initial direct local view")
    check(JSON.stringify(h.uiReads) === JSON.stringify([["schema", "device", "doc:settings"]]), "one initial named local get")
    check(h.requestBytes.length === 0, "ordinary reads never use RPC")
    output.push(JSON.stringify({ case: "initial", localGets: 1, runtimeCalls: 0, implicitEffects: 0 }))
    await h.dispose()
    h = await createFirstRunHarness()
    first = h.openView(); second = h.openView(onboardingSender(11))
    const observed: UiEvent[] = []
    const stopFirst = first.backend.watch(event => observed.push(event)), stopSecond = second.backend.watch(event => observed.push(event))
    h.grants.music = false; h.grants.browserMenu = false
    h.order.length = 0
    const permission = first.firstRun.requestPermissions({ music: true, browserMenu: true })
    check(h.order[0] === "request", "combined permission request starts synchronously before contains")
    check(JSON.stringify(h.requests) === JSON.stringify([{ origins: ["https://music.youtube.com/*"], permissions: ["contextMenus"] }]), "one combined native request")
    h.store.mode("rejected-applied")
    const agreement = await first.firstRun.agree({ displayed: first.text.disclosure, attempt: 1,
      selected: ["shortcuts", "any-tab-keys", "music-actions", "browser-menu", "quick-save"], syncOn: false, permissions: permission })
    check(agreement.kind === "agreed" && agreement.applications.length === 5, "exact semantic applications confirm a rejected-applied setter")
    check(agreement.applications.some(row => row.feature === "any-tab-keys" && row.state === "held-site-access"), "both any-tab scopes fold")
    check(agreement.applications.some(row => row.feature === "shortcuts" && row.alsoOnMusic === "held-site-access"), "shortcuts retains denied Music")
    check(agreement.applications.some(row => row.feature === "browser-menu" && row.state === "held-browser-menu"), "denied contextMenus stays held")
    await turns()
    check(observed.length === 2, "two views observe the confirmed local storage change")
    check(h.answerBytes.every(text => !text.includes("SENTINEL_") && !text.includes("agreement-review") && !text.includes("fixture-device")), "bounded replies omit errors and owner identity")
    output.push(JSON.stringify({ case: "agreement", result: "agreed", rows: 5, music: "held", browserMenu: "held", views: observed.length }))
    h.store.mode("normal")
    const beforeCancel = h.store.batches.length
    h.choose({ kind: "cancelled" })
    const cancelled = await first.firstRun.choosePlaylist({ feature: "quick-save", purpose: "quick-save" })
    check(cancelled.kind === "cancelled" && h.store.batches.length === beforeCancel, "chooser cancellation writes nothing")
    const setupName = `doc:setup:${accountKey()}`
    h.store.foreign(records => { records[setupName] = { v: 1, gen: "fixture-setup", at: 1, by: "fixture-device", data: {
      quickSave: null, musicSave: "PL_other", autoAdd: [{ pl: "PL_auto", takes: "videos" }], targets: {}, gather: null, marks: {}, label: { name: "Kept" }
    } } })
    h.choose({ kind: "chosen", destination: { kind: "quick-save" }, playlist: playlistId() })
    const chosen = await first.firstRun.choosePlaylist({ feature: "quick-save", purpose: "quick-save" })
    check(chosen.kind === "confirmed", "canonical destination edit confirms exact readback")
    check(h.stats().accountReads > 0 && h.stats().playlistReads > 0 && h.stats().chooserCalls > 0, "required service ports are exercised")
    const saved = h.store.records()[setupName]
    check(saved && typeof saved === "object" && !Array.isArray(saved) && saved.data && typeof saved.data === "object" && !Array.isArray(saved.data), "stored Setup")
    check(saved.data.quickSave === playlistId() && saved.data.musicSave === "PL_other" && Array.isArray(saved.data.autoAdd) && saved.data.autoAdd.length === 1, "destination edit preserves unrelated choices")
    h.choose({ kind: "chosen", destination: { kind: "quick-save" }, playlist: playlistId("PL_refused") })
    h.store.mode("ignored")
    const refused = await first.firstRun.choosePlaylist({ feature: "quick-save", purpose: "quick-save" })
    check(refused.kind === "failed" && refused.reason === "unconfirmed", "Setup destination cannot confirm an ignored write")
    output.push(JSON.stringify({ case: "setup-refusal", result: "unconfirmed" }))
    output.push(JSON.stringify({ case: "setup-choice", result: "confirmed", unrelatedChoices: "preserved", cancellationWrites: 0 }))
    const lookup = second.firstRun.lookupSyncedChoices()
    lookup.cancel()
    check((await lookup.result).kind === "unavailable", "cancelled lookup drops its answer locally")
    await turns()
    h.expireLookups()
    await turns()
    check(h.stats().syncReads === 1 && h.stats().syncListeners === 0 && h.stats().lookupTimers === 0, "only explicit lookup reads sync and bounded lookup releases resources")
    output.push(JSON.stringify({ case: "lookup", syncReads: 1, lateAnswer: "dropped", listeners: 0 }))
    stopFirst(); stopFirst(); stopSecond(); stopSecond()
    check(h.stats().localAdds === 2 && h.stats().localRemoves === 2 && h.stats().localListeners === 0, "listeners dispose once")
  } finally { await h.dispose() }
  check(h.stats().nativeListeners === 0 && h.stats().deadlines === 0 && h.stats().localListeners === 0, "all fixture-owned resources released")
  output.push(JSON.stringify({ case: "closed", nativeListeners: 0, localListeners: 0, deadlines: 0 }))
  return output
}

if (import.meta.main) for (const line of await runFirstRunBackendConsumer()) console.log(line)
