import type { AttemptContext, Dispatch, GatewayRequestPort, HttpAnswer, RequestSpec } from "../gateway/port"
import { field } from "../read-parsers"

export function createLiveMusicRequests(options: { window: Window; document: Document }): GatewayRequestPort {
  const { window: win, document: doc } = options
  function manager() { return field(doc.querySelector("ytmusic-app"), "networkManager") }
  function dispatch(spec: RequestSpec, context: AttemptContext): Dispatch {
    const receiver = manager(), fetch = field(receiver, "fetch")
    if (typeof fetch !== "function") return { kind: "not-sent", cause: "missing" }
    const failure = context.check()
    if (failure) return { kind: "blocked", failure }
    const answer = new Promise<HttpAnswer>((resolve, reject) => {
      try {
        const result: unknown = Reflect.apply(fetch, receiver, [`/${spec.path}`, spec.body])
        void Promise.resolve(result).then(body => resolve({ http: 200, body }), error => {
          context.observe(error)
          const http = field(error, "status") ?? field(error, "statusCode")
          if (typeof http === "number" && Number.isInteger(http) && http >= 400 && http <= 599) {
            resolve({ http, body: field(error, "response") ?? error })
          } else reject(new Error("Music answer lost"))
        })
      } catch { reject(new Error("Music dispatch uncertain")) }
    })
    return { kind: "pending", answer, cancel() {} }
  }
  return {
    has(via) { return win.location.origin === "https://music.youtube.com" && via === "music" && typeof field(manager(), "fetch") === "function" },
    send(via, spec, context) {
      if (win.location.origin !== "https://music.youtube.com" || via !== "music") return { kind: "not-sent", cause: "missing" }
      return dispatch(spec, context)
    }
  }
}
