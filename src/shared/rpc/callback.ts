import type { Transport } from "./transport"

export type CallbackListener<Sender> = (message: unknown, sender: Sender, sendResponse: (response?: unknown) => void) => boolean
export type CallbackPort<Sender> = {
  sendMessage(message: unknown): Promise<unknown>
  readonly onMessage: {
    addListener(listener: CallbackListener<Sender>): void
    removeListener(listener: CallbackListener<Sender>): void
  }
}

export function callbackTransport<Sender>(runtime: CallbackPort<Sender>): Transport<Sender> {
  return {
    send: message => runtime.sendMessage(message),
    listen(receive) {
      const unanswered = new Set<() => void>()
      let listening = true

      function listener(message: unknown, sender: Sender, sendResponse: (response?: unknown) => void): boolean {
        let claim: Promise<unknown> | undefined
        try {
          claim = receive({ message, sender })
        } catch {
          return false
        }
        if (claim === undefined) return false
        let open = true
        const answer = (value: unknown) => {
          if (!open) return
          open = false
          unanswered.delete(release)
          try {
            sendResponse(value)
          } catch {}
        }
        const release = () => answer(undefined)
        claim.then(answer, release)
        if (listening) unanswered.add(release)
        else release()
        return true
      }

      runtime.onMessage.addListener(listener)
      return () => {
        if (!listening) return
        listening = false
        runtime.onMessage.removeListener(listener)
        for (const release of [...unanswered]) release()
      }
    }
  }
}
