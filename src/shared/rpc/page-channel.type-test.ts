import type { PageChannel, PageFrameListener, PageWire } from "./page-channel"
import { createDirectPageChannel, createDomPageChannel } from "./page-channel"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
export type PageChannelRelationships = [
  Assert<Equal<PageWire, "req" | "res" | "retire">>,
  Assert<Equal<Parameters<PageFrameListener>, [detail: unknown, target: Element | null]>>,
  Assert<Equal<ReturnType<PageChannel["listen"]>, () => void>>,
  Assert<Equal<ReturnType<typeof createDomPageChannel>, PageChannel>>,
  Assert<Equal<ReturnType<typeof createDirectPageChannel>, PageChannel>>
]

declare const channel: PageChannel
declare const item: Element
declare const doc: Document

export function positives(): void {
  channel.send("req", "{}", item)
  channel.send("res", "{}")
  const stop: () => void = channel.listen("retire", (detail, target) => {
    void detail
    void target
  })
  stop()
  createDomPageChannel(doc)
}

export function negatives(): void {
  // @ts-expect-error Frames carry JSON strings, never objects.
  channel.send("req", { kind: "hello" })
  // @ts-expect-error Wires are the three protocol names, not event types.
  channel.send("ppt:req", "{}")
  // @ts-expect-error Requests target an item element; document is the default.
  channel.send("req", "{}", doc)
  channel.listen("req", detail => {
    // @ts-expect-error Received detail is untrusted until validated.
    void detail.length
  })
  // @ts-expect-error The DOM adapter needs the document it listens on.
  createDomPageChannel()
}
