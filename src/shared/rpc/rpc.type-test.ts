import type { BuildId } from "../contracts/vocabulary"
import { createRpc, createRpcCaller } from "./rpc"
import type { Authentication, Deadline, Rpc, RpcCaller, RpcContract, RpcFailure, RpcOutcome, RpcReceiver, RpcRequest } from "./rpc"
import type { Transport } from "./transport"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

type NativeSender = { readonly id: string; readonly frameId: number }
type Calls = {
  "test.add": { payload: { video: string; playlists: string[] }; result: { added: number } }
  "test.ping": { payload: null; result: { pong: string } }
}
declare const transport: Transport<NativeSender>
declare const contract: RpcContract<Calls>
declare const build: BuildId
declare const deadline: Deadline
declare const otherContract: RpcContract<{ other: { payload: null; result: null } }>
const rpc = createRpc(transport, { build, contract, deadline })
const caller = createRpcCaller({ send: transport.send }, { build, contract, deadline })

export type RpcRelationships = [
  Assert<Equal<typeof caller, RpcCaller<Calls>>>,
  Assert<Equal<ReturnType<typeof caller.call<"test.ping">>, Promise<RpcOutcome<{ pong: string }>>>>,
  Assert<Equal<typeof rpc, Rpc<Calls, NativeSender>>>,
  Assert<Equal<ReturnType<typeof rpc.call<"test.add">>, Promise<RpcOutcome<{ added: number }>>>>,
  Assert<Equal<RpcFailure, "timeout" | "transport" | "invalid-answer" | "receiver-failed" | "disposed">>,
  Assert<Equal<RpcRequest<Calls>, { readonly kind: "test.add"; readonly payload: Calls["test.add"]["payload"] } | { readonly kind: "test.ping"; readonly payload: null }>>,
  Assert<Equal<Extract<RpcOutcome<{ added: number }>, { kind: "failed" }>, { readonly kind: "failed"; readonly failure: RpcFailure }>>
]

export async function sendOnlyPairs() {
  const added = await caller.call("test.add", { video: "v", playlists: [] })
  if (added.kind === "answered") {
    const count: number = added.result.added
    // @ts-expect-error The send-only add result has no pong.
    const pong = added.result.pong
    void [count, pong]
  }
  // @ts-expect-error A send-only caller cannot handle incoming messages.
  caller.handle({})
  // @ts-expect-error A send-only caller cannot listen for incoming messages.
  caller.listen(() => undefined)
  // @ts-expect-error The send-only ping payload is null.
  await caller.call("test.ping", { video: "v" })
  // @ts-expect-error The send-only caller cannot call an unknown kind.
  await caller.call("test.missing", null)
  caller.dispose()
}

export async function callerPairs() {
  const added = await rpc.call("test.add", { video: "v", playlists: [] })
  if (added.kind === "answered") {
    const count: number = added.result.added
    // @ts-expect-error An add result is not a ping result.
    const pong: string = added.result.pong
    void [count, pong]
  } else {
    const failure: RpcFailure = added.failure
    // @ts-expect-error A transport failure carries no domain result.
    const result = added.result
    void [failure, result]
  }
  // @ts-expect-error A ping takes no add payload.
  await rpc.call("test.ping", { video: "v", playlists: [] })
  // @ts-expect-error An add needs its playlists.
  await rpc.call("test.add", { video: "v" })
  // @ts-expect-error Unknown kinds are not callable.
  await rpc.call("test.unknown", null)
  const ping = await rpc.call("test.ping", null)
  // @ts-expect-error A failed call is not a domain result.
  const pong: string = ping.result.pong
  void pong
}

export function receiverShapes() {
  const authenticate = ({ sender }: { sender: NativeSender; request: RpcRequest<Calls> }): Authentication<{ tabId: number }> =>
    sender.frameId === 0 ? { kind: "accepted", context: { tabId: 1 } } : { kind: "rejected" }
  rpc.handle({
    authenticate,
    handlers: { "test.add": (payload, context) => ({ added: payload.playlists.length + context.tabId }), "test.ping": async () => ({ pong: "p" }) }
  })
  rpc.handle({
    authenticate,
    // @ts-expect-error Every kind of the receiving map needs a handler.
    handlers: { "test.add": () => ({ added: 0 }) }
  })
  rpc.handle({
    authenticate,
    // @ts-expect-error A handler answers its own kind's result.
    handlers: { "test.add": () => ({ pong: "p" }), "test.ping": () => ({ pong: "p" }) }
  })
  rpc.handle({
    authenticate,
    handlers: {
      // @ts-expect-error The handler context is the authenticated context, not the native sender.
      "test.add": (_payload, context) => ({ added: context.frameId }),
      "test.ping": () => ({ pong: "p" })
    }
  })
  // @ts-expect-error Receiving requires an explicit authentication boundary.
  rpc.handle({ handlers: { "test.add": () => ({ added: 0 }), "test.ping": () => ({ pong: "p" }) } })
  const bodySender: RpcReceiver<Calls, NativeSender, null> = {
    // @ts-expect-error Authentication reads the native sender type, not a body-supplied origin.
    authenticate: ({ sender }: { sender: { origin: string }; request: RpcRequest<Calls> }) => (sender.origin === "tab" ? { kind: "accepted", context: null } : { kind: "rejected" }),
    handlers: { "test.add": () => ({ added: 0 }), "test.ping": () => ({ pong: "p" }) }
  }
  void bodySender
}

export function contractShapes() {
  const partial: RpcContract<Calls> = {
    // @ts-expect-error Every kind needs a payload guard, a result guard and a deadline.
    "test.add": { payload: (v: unknown): v is Calls["test.add"]["payload"] => v !== null, result: (v: unknown): v is { added: number } => v !== null },
    "test.ping": { payload: (v: unknown): v is null => v === null, result: (v: unknown): v is { pong: string } => v !== null, timeoutMs: 2_000 }
  }
  void partial
  // @ts-expect-error A contract for another map cannot drive this transport's calls.
  const mismatched: Rpc<Calls, NativeSender> = createRpc(transport, { build, contract: otherContract, deadline })
  void mismatched
}
