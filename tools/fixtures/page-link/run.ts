import { GlobalRegistrator } from "@happy-dom/global-registrator"
import { isPageType, isVideoInfo } from "../../../src/shared/contracts"
import { checked, expectedKey, harness, invocation, nav, rawIdentity, snapshot, syntheticSignal } from "./support"

export async function runPageLinkFixture(dom: boolean) {
  const video = checked(isVideoInfo, { videoId: "dQw4w9WgXcQ", title: "Synthetic video", length: 120, kind: "video" })
  const h = harness({ dom, link: { clock: undefined }, pageSnapshot: () => ({ ...snapshot(), video }) })
  const records: { step: string; answer: unknown }[] = []
  try {
    records.push({ step: "hello", answer: await h.link.hello })
    records.push({ step: "account", answer: await h.link.run({ job: { kind: "account" } }) })
    const target = document.createElement("article")
    document.body.append(target)
    try {
      const answer = await h.link.run({ job: { kind: "openCardMenu", videoId: video.videoId } }, { target })
      records.push({ step: "target", answer: { result: answer, actualTarget: h.calls.at(-1)?.context?.target === target } })
    } finally {
      target.remove()
    }
    records.push({ step: "probe", answer: await h.link.probe() })
    const stream: unknown[] = []
    const stop = h.link.watch("nav", data => stream.push(data))
    h.watchers[0]?.emit(nav)
    stop()
    stop()
    h.watchers[0]?.emit({ ...nav, pageType: checked(isPageType, "HOME") })
    records.push({ step: "stream", answer: { values: stream, stops: h.watchers[0]?.stops } })
    const signals: unknown[] = []
    h.link.onSignal(signal => signals.push(signal))
    for (const sink of h.signals) sink(syntheticSignal)
    records.push({ step: "signal", answer: signals })
    const dispatchedBefore = h.calls.length
    const mismatch = await h.link.run(invocation({ job: { kind: "playlists" }, acct: "AAAAAAAAAAAAAAAA" }))
    records.push({ step: "stale-pin", answer: { result: mismatch, zeroDispatch: h.calls.length === dispatchedBefore } })
    h.dispose()
    records.push({ step: "disposed", answer: { state: h.link.state, listeners: h.tracked.listenerCount, signals: h.signalStops } })
    const text = records.map(record => JSON.stringify(record)).join("\n") + "\n"
    if (text.includes(rawIdentity) || text.includes("datasyncId")) throw new Error("Unsafe synthetic fixture output")
    const hello = records[0]?.answer
    if (
      JSON.stringify(hello) !==
      JSON.stringify({ ok: true, snapshot: { signedIn: true, acct: expectedKey(rawIdentity), pageType: checked(isPageType, "WATCH"), video, startedHidden: true, navType: "reload" } })
    )
      throw new Error("Synthetic account projection mismatch")
    return text
  } finally {
    h.dispose()
  }
}

if (import.meta.main) {
  GlobalRegistrator.register()
  const adapter = process.argv[2]
  if (adapter !== "direct" && adapter !== "dom") throw new Error("Expected direct or dom adapter")
  process.stdout.write(await runPageLinkFixture(adapter === "dom"))
  await GlobalRegistrator.unregister()
}
