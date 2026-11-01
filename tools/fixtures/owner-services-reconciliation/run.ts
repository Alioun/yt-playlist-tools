import { deepStrictEqual, strictEqual } from "node:assert"
import expected from "./expected.json"
import { ACCOUNT_LABEL_MS } from "../../../src/background/store/account-label"
import { compose, reservation, fileFrom, a, b, alpha, beta, epoch, origin, object, success, deferred, signedOut } from "./harness"

export async function runSession() {
  const rows: unknown[] = [], observed = compose(), { h, events } = observed
  try {
    const before = h.stored(), writes = h.writes
    const file = await fileFrom(h.owner), reads = h.reads
    const plan = await h.owner.importCheck(origin, file.text)
    if (plan.kind !== "import-plan") throw Error("Expected checked proposal")
    deepStrictEqual(h.stored(), before)
    rows.push({ step: "read-check", accounts: plan.accountCount, provenance: plan.provenance,
      freshReads: h.reads - reads, writes: h.writes - writes, events: events.length })

    const reserved = reservation(await h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    rows.push({ step: "reservation", stamp: object(h.stored()[`cache:${a}`]).labelAt === epoch,
      lastAccount: object(h.stored().device).lastAccount === a, generations: h.removal.counts().generations, events: events.length })
    const unchanged = await h.owner.completeAccountLabel(reserved.capture, { acct: a, label: { name: "Original" } })
    rows.push({ step: "unchanged", result: unchanged.kind, generations: h.removal.counts().generations, events: events.length })

    h.advance(ACCOUNT_LABEL_MS)
    h.script(async () => success({ name: "Changed" }))
    const changed = await h.accounts.onSeen(h.context())
    rows.push({ step: "changed", result: changed.label.kind === "completed" ? changed.label.result.kind : changed.label.kind,
      label: h.label(), events: [...events], generations: h.removal.counts().generations, jobs: h.runs().length })

    const privacyReads = h.reads, privacyWrites = h.writes, privacyJobs = h.runs().length
    const privateSeen = await h.accounts.onSeen(h.context(a, 9, true))
    const signedOutSeen = await h.accounts.onSeen({ ...h.context(), info: signedOut() })
    const privateCheck = await h.owner.importCheck({ ...origin, incognito: true }, file.text)
    rows.push({ step: "privacy", seen: privateSeen.label.kind, signedOut: signedOutSeen.label.kind,
      check: privateCheck.kind === "refused" ? privateCheck.reason : privateCheck.kind,
      reads: h.reads - privacyReads, writes: h.writes - privacyWrites, jobs: h.runs().length - privacyJobs, events: events.length })
  } finally { await observed.dispose() }

  const late = compose()
  try {
    const first = reservation(await late.h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    const second = reservation(await late.h.owner.seeAccountLabel({ acct: b, private: false, at: epoch }))
    const secondResult = await late.h.owner.completeAccountLabel(second.capture, { acct: b, label: { name: "Second" } })
    const firstResult = await late.h.owner.completeAccountLabel(first.capture, { acct: a, label: { name: "Late first" } })
    rows.push({ step: "late-last-account", results: [secondResult.kind, firstResult.kind],
      lastAccountIsSecond: object(late.h.stored().device).lastAccount === b, events: late.events.length })
  } finally { await late.dispose() }

  const independent = compose()
  try {
    const captured = reservation(await independent.h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    strictEqual((await independent.h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "gather" }, expected: { setup: "live", playlist: null }, playlist: beta })).kind, "committed")
    independent.h.removal.foreign(state => { state.local[`doc:filter:${a}:${alpha}`] = { v: 1, gen: "independent", at: 1, by: "fixture", data: { mode: "allow", on: true, channels: [] } } })
    const cacheRead = await independent.h.owner.readPlaylistCache({ acct: a, private: false })
    if (cacheRead.kind !== "cache" || cacheRead.authority.kind !== "eligible") throw Error("Expected actual cache capture")
    strictEqual((await independent.h.owner.absorbPlaylistCache(cacheRead.authority.capture, { kind: "list", acct: a, site: "www", at: epoch + 1, rows: [{ id: beta, title: "Independent" }] })).kind, "committed")
    const before = independent.h.stored()
    const result = await independent.h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Independent label" } })
    rows.push({ step: "independent", result: result.kind,
      destination: object(object(independent.h.stored()[`doc:setup:${a}`]).data).gather === beta,
      filter: JSON.stringify(independent.h.stored()[`doc:filter:${a}:${alpha}`]) === JSON.stringify(before[`doc:filter:${a}:${alpha}`]),
      cache: JSON.stringify(independent.h.stored()[`cache:${a}`]) === JSON.stringify(before[`cache:${a}`]),
      otherAccount: JSON.stringify(independent.h.stored()[`doc:setup:${b}`]) === JSON.stringify(before[`doc:setup:${b}`]), events: independent.events.length })
  } finally { await independent.dispose() }

  const recreated = compose(), entered = deferred<void>(), answer = deferred<unknown>()
  try {
    recreated.h.script(async () => { entered.resolve(); return answer.promise })
    const pending = recreated.h.accounts.onSeen(recreated.h.context())
    await entered.promise
    const preparation = await recreated.h.owner.prepareAccountRemoval(origin, a)
    if (preparation.kind !== "confirmation-required") throw Error("Expected account removal confirmation")
    strictEqual((await recreated.h.owner.removeAccountSetup(origin, preparation.confirmation)).kind, "committed")
    strictEqual((await recreated.h.owner.changeSetupDestination(origin, { acct: a, destination: { kind: "quick-save" }, expected: { setup: "none" }, playlist: beta })).kind, "committed")
    const beforeEvents = recreated.events.length
    answer.resolve(success({ name: "Stale resurrection" }))
    const result = await pending
    rows.push({ step: "recreated", result: result.label.kind === "completed" ? result.label.result.kind : result.label.kind,
      label: recreated.h.label(), newEvents: recreated.events.length - beforeEvents })
  } finally { answer.resolve({ ok: false, reason: "unavailable" }); await recreated.dispose() }

  const uncertain = compose()
  try {
    const captured = reservation(await uncertain.h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
    uncertain.h.fault("label", "unreadable")
    const result = await uncertain.h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Unconfirmed" } })
    const stopped = await uncertain.h.owner.importCheck(origin, "{}")
    rows.push({ step: "uncertain", result: result.kind === "setup" ? result.result.kind : result.kind,
      events: uncertain.events.length, revocations: uncertain.revocations, checking: stopped.kind })
  } finally { await uncertain.dispose() }

  const disposed = compose()
  const captured = reservation(await disposed.h.owner.seeAccountLabel({ acct: a, private: false, at: epoch }))
  await disposed.h.owner.dispose()
  const result = await disposed.h.owner.completeAccountLabel(captured.capture, { acct: a, label: { name: "Too late" } })
  rows.push({ step: "disposed", result: result.kind, events: disposed.events.length,
    export: (await disposed.h.owner.exportSettings(origin)).kind, revocations: disposed.revocations })
  await disposed.dispose()
  rows.push({ step: "eof", complete: true })
  deepStrictEqual(rows, expected, "complete reconciled owner, Accounts and actual Tabs transcript through EOF")
  return rows
}

if (import.meta.main) for (const row of await runSession()) process.stdout.write(`${JSON.stringify(row)}\n`)
