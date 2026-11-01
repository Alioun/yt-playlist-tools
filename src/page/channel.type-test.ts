import type { BreakageSignal, JobOf, JobResult, ProbeReport, StreamData } from "../shared/contracts"
import type { PageAccountData, PageHelloSnapshot, PageJobResult } from "../shared/contracts/page"
import type { PageChannel } from "../shared/rpc/page-channel"
import { servePage } from "./channel"
import type { PageEndpoint, PageGatewayOperations, PageServeOptions } from "./channel"
// @ts-expect-error The dispatcher belongs to the page world, not the safe contracts root.
import { servePage as rootServePage } from "../shared/contracts"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
type AccountRun = Awaited<ReturnType<PageGatewayOperations["run"]>>
export type PageServeRelationships = [
  Assert<Equal<Parameters<typeof servePage>, [gateway: PageGatewayOperations, options: PageServeOptions, channel: PageChannel]>>,
  Assert<Equal<ReturnType<typeof servePage>, PageEndpoint>>,
  Assert<Equal<Extract<PageJobResult<JobOf<"account">>, { ok: true }>["data"], PageAccountData>>,
  Assert<Equal<AccountRun, PageJobResult>>,
  Assert<Equal<ReturnType<PageServeOptions["snapshot"]>, PageHelloSnapshot>>,
  Assert<Equal<Parameters<Parameters<PageServeOptions["signals"]>[0]>, [signal: BreakageSignal]>>
]

declare const channel: PageChannel
declare const options: PageServeOptions
declare const gateway: PageGatewayOperations
declare const accountJob: JobOf<"account">
declare const safeAccountResult: JobResult<JobOf<"account">>
declare const report: ProbeReport

export function positives(): void {
  const operations: PageGatewayOperations = {
    run: async () => ({ ok: false, reason: "unavailable" }),
    watch: (_stream, onData) => { void onData; return () => {} },
    probe: async () => report
  }
  const endpoint: PageEndpoint = servePage(operations, options, channel)
  endpoint.dispose()
  void gateway.run(accountJob).then(result => {
    if (result.ok) { const raw: string | null = result.data.datasyncId; void raw }
  })
  gateway.watch("queue", (data: StreamData<"queue">) => { void data.ids })
}

export function negatives(): void {
  void gateway.run(accountJob).then(result => {
    // @ts-expect-error Page account answers carry the raw datasyncId, not the hashed account key.
    if (result.ok) void result.data.acct
  })
  // @ts-expect-error A safe JobResult is not a raw page result for the account job.
  const raw: PageJobResult<JobOf<"account">> = safeAccountResult
  void raw
  // @ts-expect-error Stream callbacks receive that stream's data.
  gateway.watch("queue", (data: StreamData<"nav">) => { void data })
  // @ts-expect-error Snapshot and signal sources are explicit dependencies.
  servePage(gateway, { site: "www", build: options.build, vocabulary: options.vocabulary }, channel)
  // @ts-expect-error The signal source must hand back its disposer.
  servePage(gateway, { ...options, signals: () => undefined }, channel)
  // @ts-expect-error The dispatcher takes a page channel, not a window.
  servePage(gateway, options, window)
  // @ts-expect-error Endpoints expose disposal state read-only.
  servePage(gateway, options, channel).disposed = true
  void rootServePage
}
