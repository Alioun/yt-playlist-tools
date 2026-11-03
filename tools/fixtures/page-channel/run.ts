import { CONTRACT_VERSION, isBuildId, isPageRequestId, isPageType, isPageWatchId, isRouteId, isWatchId, parseJsonText } from "../../../src/shared/contracts"
import type { Job, PageRequestId, PageWatchId, Stream, StreamData } from "../../../src/shared/contracts"
import { isPageHelloAnswer, isPageProbeAnswerFor, isPageRunAnswerFor, isPageStreamEventFor } from "../../../src/shared/contracts/page"
import type { PageJobResult } from "../../../src/shared/contracts/page"
import { createDirectPageChannel } from "../../../src/shared/rpc/page-channel"
import { servePage, type PageGatewayOperations } from "../../../src/page/channel"

function checked<T>(guard: (value: unknown) => value is T, value: unknown): T {
  if (!guard(value)) throw new Error(`Invalid fixture value ${String(value)}`)
  return value
}
const build = checked(isBuildId, "fixture-build")
const route = checked(isRouteId, "fixture-route")
const dependency = checked(isWatchId, "fixture-dependency")
const header = { v: CONTRACT_VERSION, build }

export type FixtureRecord = { step: string; accepted: boolean; answer: unknown }

export async function runPageChannelFixture(): Promise<FixtureRecord[]> {
  const stopped: string[] = []
  let push: ((data: StreamData<"nav">) => void) | undefined
  const gateway: PageGatewayOperations = {
    async run<J extends Job>(job: J): Promise<PageJobResult<J>> {
      if (job.kind === "castState") return { ok: true, data: { casting: false }, route } as PageJobResult<J>
      return { ok: false, reason: "unavailable" }
    },
    watch<S extends Stream>(stream: S, onData: (data: StreamData<S>) => void) {
      if (stream === "nav") push = data => onData(data as StreamData<S>)
      return () => {
        stopped.push(stream)
      }
    },
    async probe() {
      return { site: "www", entries: [{ id: dependency, present: true }] }
    }
  }
  const channel = createDirectPageChannel()
  const answers: unknown[] = []
  const stopAnswers = channel.listen("res", detail => {
    const parsed = parseJsonText(detail)
    if (parsed.ok) answers.push(parsed.value)
  })
  const endpoint = servePage(
    gateway,
    {
      site: "www",
      build,
      vocabulary: () => ({ routes: [route], watchIds: [dependency], schemaKeys: [] }),
      snapshot: () => ({ signedIn: false, datasyncId: null, pageType: checked(isPageType, "HOME"), startedHidden: false, navType: "navigate" }),
      signals: () => () => {}
    },
    channel
  )
  const request = (payload: Record<string, unknown>) => channel.send("req", JSON.stringify({ ...header, ...payload }))
  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0))
  const take = () => answers.splice(0)
  const records: FixtureRecord[] = []
  const record = (step: string, accepted: (answer: unknown) => boolean) => {
    for (const answer of take()) records.push({ step, accepted: accepted(answer), answer })
  }

  request({ kind: "hello" })
  record("hello", answer => isPageHelloAnswer(answer, { build, site: "www" }))

  const runId: PageRequestId = checked(isPageRequestId, "fixture-run")
  const job = { kind: "castState" } satisfies Job
  request({ kind: "run", id: runId, job })
  await settle()
  record("run", answer => isPageRunAnswerFor({ id: runId, job }, answer, build))

  const probeId: PageRequestId = checked(isPageRequestId, "fixture-probe")
  request({ kind: "probe", id: probeId })
  await settle()
  record("probe", answer => isPageProbeAnswerFor({ id: probeId, site: "www", watchIds: [dependency] }, answer, build))

  const watchId: PageWatchId = checked(isPageWatchId, "fixture-watch")
  request({ kind: "watch", id: watchId, stream: "nav" })
  push?.({ pageType: checked(isPageType, "WATCH"), video: null, navigation: { kind: "other" } })
  record("stream", answer => isPageStreamEventFor({ id: watchId, stream: "nav" }, answer, build))
  request({ kind: "unwatch", id: watchId })
  push?.({ pageType: checked(isPageType, "HOME"), video: null, navigation: { kind: "other" } })
  record("after unwatch", () => false)

  request({ kind: "run", id: runId, job })
  channel.send("retire", JSON.stringify({ ...header, build: checked(isBuildId, "fixture-newer-build"), kind: "retire" }))
  await settle()
  record("after retire", () => false)
  records.push({ step: "retired", accepted: endpoint.disposed && stopped.join() === "nav", answer: { stopped } })
  stopAnswers()
  return records
}

if (import.meta.main) {
  for (const record of await runPageChannelFixture()) console.log(JSON.stringify(record))
}
