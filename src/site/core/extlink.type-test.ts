import type { AccountKey } from "../../shared/model/validation"
import type { Job, JobInvocation, JobOf, JobResult } from "../../shared/contracts/jobs"
import { tabJobMessages, tabJobReceiverMessages, tabPingMessages, type TabJobMessages, type TabPingMessages, type TabViewScope } from "../../shared/contracts/tabs"
import { createRpc, createRpcCaller, type Deadline, type RpcContract } from "../../shared/rpc/rpc"
import type { Transport } from "../../shared/rpc/transport"
import { createExtLink, type ExtLinkOptions } from "./extlink"
import { nativeExtLinkRuntime, type ExtLinkNativeSender, type ExtLinkRuntimePort } from "./adapters/extlink-runtime"
import type { PageLink } from "./page-link"
import type { BuildId } from "../../shared/contracts/vocabulary"

type CompleteView = TabViewScope & { readonly fixture: { readonly revision: number } }
declare const build: BuildId
declare const acct: AccountKey
declare const page: PageLink
declare const native: ExtLinkRuntimePort
declare const transport: Transport<ExtLinkNativeSender>
declare const deadline: Deadline
declare const isView: (value: unknown) => value is CompleteView
declare const isScope: (value: unknown) => value is TabViewScope

export const receiving: RpcContract<TabJobMessages<Job>> = tabJobReceiverMessages()
export async function jobTypes() {
  // @ts-expect-error Account-dependent invocation requires its trusted pin.
  const unpinned: JobInvocation<JobOf<"playlists">> = { job: { kind: "playlists" } }
  const invocation: JobInvocation<JobOf<"playlists">> = { job: { kind: "playlists" }, acct }
  const caller = createRpcCaller<TabJobMessages<JobOf<"playlists">>>(transport, { build, deadline, contract: tabJobMessages(invocation, 10_000) })
  const answer = await caller.call("bg.job", invocation)
  if (answer.kind === "answered") {
    const correlated: JobResult<JobOf<"playlists">> = answer.result
    // @ts-expect-error A playlists result cannot become a castState result.
    const wrong: JobResult<JobOf<"castState">> = answer.result
    void [correlated, wrong]
  }
  caller.dispose()
  void unpinned
}

export function completeViewTypes() {
  const base = { build, site: "www" as const, page, deadline, hiddenAtStart: false, runtime: nativeExtLinkRuntime(native) }
  createExtLink<CompleteView, ExtLinkNativeSender>({ ...base, isView })
  // @ts-expect-error A complete-view predicate is mandatory.
  createExtLink<CompleteView, ExtLinkNativeSender>(base)
  // @ts-expect-error A scope guard cannot establish the complete injected view.
  createExtLink<CompleteView, ExtLinkNativeSender>({ ...base, isView: isScope })
  // @ts-expect-error Runtime sender identity never comes from a body-supplied context.
  nativeExtLinkRuntime(native).senderId({ kind: "extension", id: "body-claim" })
  const options: ExtLinkOptions<CompleteView, ExtLinkNativeSender> = { ...base, isView }
  const ext = createExtLink(options)
  // @ts-expect-error A consumer cannot replace the owned current view.
  ext.view = null
}

export function senderAndContextTypes() {
  const rpc = createRpc<TabPingMessages, ExtLinkNativeSender>(transport, { build, deadline, contract: tabPingMessages() })
  rpc.handle({
    authenticate: () => ({ kind: "accepted", context: { kind: "extension" as const } }),
    handlers: { "bg.ping": (_payload, context) => {
      // @ts-expect-error An authenticated context is not the native sender.
      void context.id
      return { site: "www", build, signedIn: false, acct: null }
    } }
  })
  // @ts-expect-error A raw RPC body cannot supply native sender metadata.
  nativeExtLinkRuntime(native).senderId({ payload: { id: "body-claim" } })
  rpc.dispose()
}
