export type PageWire = "req" | "res" | "retire"
export type PageFrameListener = (detail: unknown, target: Element | null) => void

export interface PageChannel {
  send(wire: PageWire, text: string, target?: Element): void
  listen(wire: PageWire, onFrame: PageFrameListener): () => void
}

export const pageEventTypes = { req: "ppt:req", res: "ppt:res", retire: "ppt:retire" } as const satisfies Record<PageWire, string>
/**
 * The background's presence check for the page half. It dispatches a cancelable event whose detail is a
 * build ID, and the page half of that build cancels it. Nothing is written into the page.
 */
export const pagePresenceEvent = "ppt:here"

export function createDomPageChannel(doc: Document): PageChannel {
  return {
    send(wire, text, target) {
      const on = wire === "req" && target ? target : doc
      on.dispatchEvent(new CustomEvent(pageEventTypes[wire], { detail: text, bubbles: true, composed: true }))
    },
    listen(wire, onFrame) {
      const type = pageEventTypes[wire]
      const handler = (event: Event) => {
        const detail: unknown = "detail" in event ? event.detail : undefined
        onFrame(detail, event.target instanceof Element ? event.target : null)
      }
      doc.addEventListener(type, handler)
      let listening = true
      return () => {
        if (!listening) return
        listening = false
        doc.removeEventListener(type, handler)
      }
    }
  }
}

export function createDirectPageChannel(): PageChannel {
  const listeners: Record<PageWire, Set<PageFrameListener>> = { req: new Set(), res: new Set(), retire: new Set() }
  return {
    send(wire, text, target) {
      const on = wire === "req" && target ? target : null
      const errors: unknown[] = []
      for (const listener of [...listeners[wire]]) {
        if (!listeners[wire].has(listener)) continue
        try { listener(String(text), on) } catch (error) { errors.push(error) }
      }
      if (errors.length > 0) throw errors[0]
    },
    listen(wire, onFrame) {
      const listener: PageFrameListener = (detail, target) => onFrame(detail, target)
      listeners[wire].add(listener)
      return () => { listeners[wire].delete(listener) }
    }
  }
}
