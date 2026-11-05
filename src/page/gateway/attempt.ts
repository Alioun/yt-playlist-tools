import type { JobFailure } from "../../shared/contracts"
import type { GatewayClock, JobScope } from "./lanes"
import type { AttemptContext, GatewayRequestPort, HttpAnswer, RequestRoute, RequestSpec } from "./port"

export type Attempt = { kind: "answer"; answer: HttpAnswer } | { kind: "not-sent"; cause: "missing" | "preflight" } | { kind: "blocked"; failure: JobFailure } | { kind: "lost" } | { kind: "timeout" }

export function attempt(options: {
  port: GatewayRequestPort
  route: RequestRoute
  spec: RequestSpec
  scope: JobScope
  clock: GatewayClock
  budget: number
  context: AttemptContext
  observe(body: unknown): void
}): Promise<Attempt> {
  const { port, route, spec, scope, clock, context } = options
  return new Promise(resolve => {
    let active = true
    let cancel = () => {}
    let stopTimer = () => {}
    let stopScope = () => {}
    const finish = (answer: Attempt) => {
      if (!active) return
      active = false
      stopTimer()
      stopScope()
      try {
        cancel()
      } catch {}
      resolve(answer)
    }
    const guarded: AttemptContext = {
      check() {
        const failure = context.check()
        return failure ?? (!active || !scope.active ? { ok: false, reason: "unconfirmed" } : null)
      },
      notice: kind => {
        if (active && scope.active) context.notice(kind)
      },
      observe: options.observe
    }
    stopScope = scope.onClose(() => finish({ kind: "timeout" }))
    if (!active) return
    stopTimer = clock.after(Math.max(0, Math.min(scope.remaining(), options.budget)), () => finish({ kind: "timeout" }))
    const blocked = guarded.check()
    if (blocked) {
      finish({ kind: "blocked", failure: blocked })
      return
    }
    try {
      Promise.resolve(port.send(route.via, spec, guarded)).then(
        dispatch => {
          if (dispatch.kind !== "pending") {
            finish(dispatch)
            return
          }
          cancel = dispatch.cancel
          void dispatch.answer.then(
            answer => {
              try {
                options.observe(answer.body)
              } catch {}
              finish({ kind: "answer", answer })
            },
            error => {
              try {
                options.observe(error)
              } catch {}
              finish({ kind: "lost" })
            }
          )
          if (!active) {
            try {
              cancel()
            } catch {}
          }
        },
        error => {
          try {
            options.observe(error)
          } catch {}
          finish({ kind: "lost" })
        }
      )
    } catch (error) {
      try {
        options.observe(error)
      } catch {}
      finish({ kind: "lost" })
    }
  })
}
