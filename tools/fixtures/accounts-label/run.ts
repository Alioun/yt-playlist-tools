import { deepStrictEqual } from "node:assert/strict"
import expected from "./expected.json"
import { ACCOUNT_LABEL_MS } from "../../../src/background/store/account-label"
import { a, b, epoch, seed, world, object, success } from "./harness"

export async function runSession() {
  const h = world(seed()),
    transcript: unknown[] = []
  try {
    const context = h.context()
    transcript.push({ step: "first-seen", result: await h.accounts.onSeen(context), checkedAt: object(h.stored()[`cache:${a}`]).labelAt, generations: h.removal.counts().generations })
    transcript.push({ step: "current", result: await h.accounts.onSeen(context), runs: h.runs().length })
    h.advance(ACCOUNT_LABEL_MS)
    h.script(async (_tab, invocation) => success({ name: invocation.acct === a ? "Updated" : "New account" }))
    transcript.push({ step: "changed", result: await h.accounts.onSeen(context), label: h.label(), lastAccount: h.stored().lastAccount ?? null })
    const reads = h.reads,
      writes = h.writes
    transcript.push({ step: "private", result: await h.accounts.onSeen(h.context(a, 9, true)), ownerReads: h.reads - reads, ownerWrites: h.writes - writes })
    h.removal.foreign(state => {
      delete state.local[`doc:setup:${b}`]
    })
    const newContext = h.context(b, 2)
    transcript.push({ step: "no-setup", result: await h.accounts.onSeen(newContext), hasCache: Object.hasOwn(h.stored(), `cache:${b}`), lastAccount: h.stored().lastAccount ?? null })
    transcript.push({ step: "live-header", result: await h.accounts.readLiveLabel(newContext), hasCache: Object.hasOwn(h.stored(), `cache:${b}`) })
    transcript.push({
      step: "eof",
      runs: h.runs().length,
      generations: h.removal.counts().generations,
      clockPending: h.clock.pending,
      stamp: object(h.stored()[`cache:${a}`]).labelAt === epoch + ACCOUNT_LABEL_MS
    })
    deepStrictEqual(transcript, expected, "complete Accounts, real owner and actual Tabs transcript through EOF")
    return transcript
  } finally {
    await h.dispose()
  }
}
if (import.meta.main) for (const row of await runSession()) process.stdout.write(`${JSON.stringify(row)}\n`)
