import type { AccountKey } from "../../shared/model"
import type { AccountData, JobOf, JobResult, PageRequestId, PageWatchId, StreamData } from "../../shared/contracts"
import type { PageAccountData } from "../../shared/contracts/page"
import type { PageLink, PageLinkState, PageSnapshot } from "./page-link"

declare const link: PageLink
declare const acct: AccountKey
declare const request: PageRequestId
declare const watch: PageWatchId
declare const raw: PageAccountData

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Assert<T extends true> = T
export type SafeRelationships = [
  Assert<Equal<Extract<Awaited<ReturnType<PageLink["run"]>>, { ok: true }>["data"], Extract<JobResult, { ok: true }>["data"]>>,
  Assert<Equal<Extract<PageSnapshot, { signedIn: true }>["acct"], AccountKey>>,
  Assert<Equal<Extract<PageLinkState, { kind: "ready" }>["snapshot"], PageSnapshot>>
]

export async function positives() {
  const playlists: JobResult<JobOf<"playlists">> = await link.run({ job: { kind: "playlists" }, acct })
  const account: JobResult<JobOf<"account">> = await link.run({ job: { kind: "account" } })
  const menu: JobResult<JobOf<"openCardMenu">> = await link.run({ job: { kind: "openCardMenu" } }, { target: document.body })
  if (account.ok) {
    const safe: AccountData = account.data
    void safe
  }
  const stop: () => void = link.watch("nav", (data: StreamData<"nav">, close: () => void) => { void data.pageType; close() })
  stop()
  const state: PageLinkState = link.state
  const req: PageRequestId = request
  const subscription: PageWatchId = watch
  link.onState(value => { if (value.kind === "ready") void value.snapshot.acct })()
  link.onSignal(value => { void value.site })()
  void [playlists, menu, state, req, subscription]
}

export async function negatives() {
  // @ts-expect-error Account-dependent jobs require the trusted account pin.
  await link.run({ job: { kind: "playlists" } })
  // @ts-expect-error A plain string cannot supply a trusted account brand.
  await link.run({ job: { kind: "playlists" }, acct: "AAAAAAAAAAAAAAAA" })
  // @ts-expect-error Account-free jobs cannot carry a pin into the page.
  await link.run({ job: { kind: "account" }, acct })
  // @ts-expect-error The result remains correlated with the job.
  const wrong: JobResult<JobOf<"castState">> = await link.run({ job: { kind: "playlists" }, acct })
  // @ts-expect-error The navigation callback cannot receive queue data.
  link.watch("nav", (data: StreamData<"queue">) => { void data.ids })
  // @ts-expect-error Stream names are the existing vocabulary.
  link.watch("arbitrary", () => {})
  // @ts-expect-error A raw account is not safe account data.
  const safe: AccountData = raw
  // @ts-expect-error Watch and request IDs have different brands.
  const confused: PageRequestId = watch
  // @ts-expect-error Request and watch IDs have different brands.
  const inverse: PageWatchId = request
  // @ts-expect-error Jobs reject unsupported argument shapes.
  await link.run({ job: { kind: "membership", videoId: 123 }, acct })
  // @ts-expect-error Target context does not accept an account or arbitrary authority.
  await link.run({ job: { kind: "account" } }, { target: document.body, acct })
  // @ts-expect-error Disposal state is read-only.
  link.state = { kind: "disposed" }
  const account = await link.run({ job: { kind: "account" } })
  if (account.ok) {
    // @ts-expect-error Safe account results never expose the raw identity.
    void account.data.datasyncId
  }
  const hello = await link.hello
  if (hello.ok) {
    // @ts-expect-error Safe hello snapshots never expose the raw identity.
    void hello.snapshot.datasyncId
    // @ts-expect-error Public snapshots cannot mutate the trusted account state.
    hello.snapshot.acct = acct
  }
  void [wrong, safe, confused, inverse]
}
