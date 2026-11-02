import { objectShape } from "../contracts/object-shape"
import { CONTRACT_VERSION, inspectMessageHeader } from "../contracts/protocol"
import type { BuildId } from "../contracts/vocabulary"
import type { Delivery, Transport } from "./transport"

export type RpcMap = { readonly [kind: string]: { readonly payload: unknown; readonly result: unknown } }
export type RpcKind<M extends RpcMap> = keyof M & string
export type RpcContract<M extends RpcMap> = {
  readonly [K in keyof M]: {
    readonly payload: (value: unknown) => value is M[K]["payload"]
    readonly result: (value: unknown) => value is M[K]["result"]
    readonly timeoutMs: number
  }
}
export type RpcRequest<M extends RpcMap, K extends RpcKind<M> = RpcKind<M>> = {
  [P in K]: { readonly kind: P; readonly payload: M[P]["payload"] }
}[K]
export type RpcHandlers<M extends RpcMap, Context> = {
  readonly [K in keyof M]: (payload: M[K]["payload"], context: Context) => M[K]["result"] | Promise<M[K]["result"]>
}
export type Authentication<Context> =
  | { readonly kind: "accepted"; readonly context: Context }
  | { readonly kind: "rejected" }
export type RpcReceiver<M extends RpcMap, Sender, Context> = {
  authenticate(input: { readonly sender: Sender; readonly request: RpcRequest<M> }): Authentication<Context> | Promise<Authentication<Context>>
  readonly handlers: RpcHandlers<M, Context>
}
export type RpcFailure = "timeout" | "transport" | "invalid-answer" | "receiver-failed" | "disposed"
export type RpcOutcome<Result> =
  | { readonly kind: "answered"; readonly result: Result }
  | { readonly kind: "failed"; readonly failure: RpcFailure }
export type Deadline = (ms: number, expire: () => void) => () => void
export type Rpc<M extends RpcMap, Sender> = {
  call<K extends RpcKind<M>>(kind: K, payload: M[K]["payload"]): Promise<RpcOutcome<M[K]["result"]>>
  handle<Context>(receiver: RpcReceiver<M, Sender, Context>): () => void
  dispose(): void
}
export type RpcCaller<M extends RpcMap> = Pick<Rpc<M, never>, "call" | "dispose">
export type RpcOptions<M extends RpcMap> = {
  readonly build: BuildId
  readonly contract: RpcContract<M>
  readonly deadline: Deadline
}

function failed(failure: RpcFailure): { readonly kind: "failed"; readonly failure: RpcFailure } {
  return { kind: "failed", failure }
}

export function createRpcCaller<M extends RpcMap>(transport: Pick<Transport<never>, "send">, options: RpcOptions<M>): RpcCaller<M> {
  const { build, contract, deadline } = options
  const pending = new Set<(failure: RpcFailure) => void>()
  let sequence = 0
  let disposed = false

  function envelope(id: string, kind: string, body: Record<string, (value: unknown) => boolean>) {
    return { v: (v: unknown) => v === CONTRACT_VERSION, build: (v: unknown) => v === build, id: (v: unknown) => v === id, kind: (v: unknown) => v === kind, ...body }
  }
  function readAnswer<K extends RpcKind<M>>(kind: K, id: string, raw: unknown): RpcOutcome<M[K]["result"]> {
    if (inspectMessageHeader(raw, build).kind !== "ok") return failed("invalid-answer")
    if (objectShape(raw, envelope(id, kind, { result: () => true }))) {
      const result = raw.result
      return contract[kind].result(result) ? { kind: "answered", result } : failed("invalid-answer")
    }
    return objectShape(raw, envelope(id, kind, { failure: v => v === "receiver" })) ? failed("receiver-failed") : failed("invalid-answer")
  }

  function call<K extends RpcKind<M>>(kind: K, payload: M[K]["payload"]): Promise<RpcOutcome<M[K]["result"]>> {
    if (disposed) return Promise.resolve(failed("disposed"))
    const id = String(++sequence)
    return new Promise(resolve => {
      let cancel = () => {}
      let open = true
      const settle = (outcome: RpcOutcome<M[K]["result"]>) => {
        if (!open) return
        open = false
        pending.delete(abandon)
        cancel()
        resolve(outcome)
      }
      const abandon = (failure: RpcFailure) => settle(failed(failure))
      pending.add(abandon)
      cancel = deadline(contract[kind].timeoutMs, () => abandon("timeout"))
      if (!open) {
        cancel()
        return
      }
      let sent: Promise<unknown>
      try {
        sent = transport.send({ v: CONTRACT_VERSION, build, id, kind, payload })
      } catch {
        abandon("transport")
        return
      }
      sent.then(raw => settle(readAnswer(kind, id, raw)), () => abandon("transport"))
    })
  }

  function dispose() {
    if (disposed) return
    disposed = true
    for (const abandon of [...pending]) abandon("disposed")
  }

  return { call, dispose }
}

export function createRpc<M extends RpcMap, Sender>(transport: Transport<Sender>, options: RpcOptions<M>): Rpc<M, Sender> {
  const { build, contract } = options
  const caller = createRpcCaller(transport, options)
  const receivers = new Set<() => void>()
  let disposed = false

  function isKind(value: unknown): value is RpcKind<M> {
    return typeof value === "string" && Object.hasOwn(contract, value)
  }

  function handle<Context>(receiver: RpcReceiver<M, Sender, Context>): () => void {
    if (disposed) return () => {}
    const inflight = new Set<() => void>()
    let active = true

    function bind<K extends RpcKind<M>>(kind: K, id: string, payload: unknown): ((sender: Sender) => Promise<unknown>) | undefined {
      const entry = contract[kind]
      if (!entry.payload(payload)) return undefined
      const accepted: M[K]["payload"] = payload
      const request: RpcRequest<M, K> = { kind, payload: accepted }
      const handler = receiver.handlers[kind]
      return async sender => {
        let authentication: Authentication<Context>
        try {
          authentication = await receiver.authenticate({ sender, request })
        } catch {
          return undefined
        }
        if (authentication.kind !== "accepted" || !active) return undefined
        try {
          const result = await handler(accepted, authentication.context)
          return { v: CONTRACT_VERSION, build, id, kind, result }
        } catch {
          return { v: CONTRACT_VERSION, build, id, kind, failure: "receiver" }
        }
      }
    }

    function receive({ message, sender }: Delivery<Sender>): Promise<unknown> | undefined {
      if (!active || inspectMessageHeader(message, build).kind !== "ok") return undefined
      if (!objectShape(message, {
        v: v => v === CONTRACT_VERSION, build: v => v === build,
        id: v => typeof v === "string" && v.length > 0, kind: isKind, payload: () => true
      })) return undefined
      const { id, kind, payload } = message
      if (typeof id !== "string" || !isKind(kind)) return undefined
      const answer = bind(kind, id, payload)
      if (!answer) return undefined
      return new Promise(resolve => {
        const release = () => {
          if (inflight.delete(release)) resolve(undefined)
        }
        inflight.add(release)
        void answer(sender).then(value => {
          if (inflight.delete(release)) resolve(value)
        })
      })
    }

    const unlisten = transport.listen(receive)
    const stop = () => {
      if (!active) return
      active = false
      receivers.delete(stop)
      for (const release of [...inflight]) release()
      unlisten()
    }
    receivers.add(stop)
    return stop
  }

  function dispose() {
    if (disposed) return
    disposed = true
    caller.dispose()
    for (const stop of [...receivers]) stop()
  }

  return { call: caller.call, handle, dispose }
}
