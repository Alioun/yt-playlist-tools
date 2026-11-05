import type { Transport } from "../../../src/shared/rpc/transport"
import type { ExtLinkNativeSender, ExtLinkRuntimePort } from "../../../src/site/core/adapters/extlink-runtime"

type Listener = Parameters<ExtLinkRuntimePort["onMessage"]["addListener"]>[0]

// This synthetic native port only adapts callback delivery to the shared serialized memory transport.
export function callbackRuntime(transport: Transport<ExtLinkNativeSender>, id: string) {
  const releases = new Map<Listener, () => void>()
  const claims: boolean[] = []
  const responses: unknown[] = []
  const runtime: ExtLinkRuntimePort & { readonly id: string; getURL(path: string): string } = {
    id,
    getURL: path => `chrome-extension://${id}${path}`,
    sendMessage: message => transport.send(message),
    onMessage: {
      addListener(listener) {
        if (releases.has(listener)) return
        const stop = transport.listen(({ message, sender }) => {
          let respond: (value: unknown) => void = () => {}
          const response = new Promise<unknown>(resolve => {
            respond = resolve
          })
          const claim: unknown = listener(message, sender, value => {
            responses.push(value)
            respond(value)
          })
          claims.push(claim === true)
          return claim === true ? response : undefined
        })
        releases.set(listener, stop)
      },
      removeListener(listener) {
        releases.get(listener)?.()
        releases.delete(listener)
      }
    }
  }
  return {
    runtime,
    claims,
    responses,
    get listening() {
      return releases.size
    }
  }
}
