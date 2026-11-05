import type { Component } from "svelte"

export type Dispose = () => void
export type ScopeMountTarget = Element | ShadowRoot
export interface ScopeMountPort {
  mount<Props extends Record<string, unknown>, Exports extends Record<string, unknown>, Bindings extends keyof Props | "">(
    component: Component<Props, Exports, Bindings>, props: NoInfer<Props>, where: ScopeMountTarget
  ): Dispose
}
export interface ScopeOptions {
  readonly document: Document
  readonly mount?: ScopeMountPort
  onError(error: unknown): void
}
type Events<T extends EventTarget> = T extends Window ? WindowEventMap
  : T extends Document ? DocumentEventMap
  : T extends HTMLMediaElement ? HTMLMediaElementEventMap
  : T extends HTMLElement ? HTMLElementEventMap
  : T extends SVGElement ? SVGElementEventMap
  : T extends AbortSignal ? AbortSignalEventMap
  : Record<string, Event>
// DOM listener callbacks are bivariant, as in EventListenerObject.handleEvent.
type Listener<E> = { handleEvent(event: E): void }["handleEvent"]
const nothing: Dispose = () => {}

export class Scope {
  private ended = false
  private readonly resources = new Set<Dispose>()

  constructor(private readonly options: ScopeOptions) {}

  get disposed(): boolean { return this.ended }
  get resourceCount(): number { return this.resources.size }

  private clean(dispose: Dispose): void {
    try { dispose() } catch (error) {
      try { this.options.onError(error) } catch {}
    }
  }

  private acquire(start: (release: Dispose, live: () => boolean) => Dispose): Dispose {
    if (this.ended) return nothing
    let cleanup: Dispose | undefined
    let released = false
    const release = () => {
      if (released) return
      released = true
      this.resources.delete(release)
      const dispose = cleanup
      cleanup = undefined
      if (dispose) this.clean(dispose)
    }
    this.resources.add(release)
    try {
      const dispose = start(release, () => !released && !this.ended)
      if (released || this.ended) this.clean(dispose)
      else cleanup = dispose
    } catch (error) {
      release()
      throw error
    }
    return release
  }

  add(dispose: Dispose): Dispose {
    if (this.ended) { this.clean(dispose); return nothing }
    return this.acquire(() => dispose)
  }

  on<T extends EventTarget, K extends keyof Events<NoInfer<T>> & string>(
    target: T, type: K, fn: Listener<Events<NoInfer<T>>[NoInfer<K>] & Event>, opts?: boolean | AddEventListenerOptions
  ): Dispose {
    const capture = typeof opts === "boolean" ? opts : opts?.capture ?? false
    const once = typeof opts === "object" && opts.once === true
    const passive = typeof opts === "object" ? opts.passive : undefined
    const signal = typeof opts === "object" ? opts.signal : undefined
    if (signal?.aborted) return nothing
    return this.acquire((release, live) => {
      const listener: EventListenerObject = {
        handleEvent(event: Events<T>[K] & Event) {
          if (!live()) return
          if (once) release()
          fn.call(target, event)
        }
      }
      const cleanup = () => {
        target.removeEventListener(type, listener, capture)
        signal?.removeEventListener("abort", release)
      }
      try {
        signal?.addEventListener("abort", release, { once: true })
        if (live() && !signal?.aborted) target.addEventListener(type, listener, { capture, passive })
        else release()
      } catch (error) { cleanup(); throw error }
      return cleanup
    })
  }

  observe(el: Element, init: MutationObserverInit, fn: MutationCallback): Dispose {
    return this.acquire((_release, live) => {
      const realm = el.ownerDocument.defaultView
      if (!realm) throw new Error("Scope observer requires a document realm")
      const observer = new realm.MutationObserver((records, source) => {
        if (live()) fn(records, source)
      })
      try { observer.observe(el, init) } catch (error) { observer.disconnect(); throw error }
      return () => observer.disconnect()
    })
  }

  timeout(fn: () => void, ms: number): Dispose {
    return this.acquire((release, live) => {
      const realm = this.options.document.defaultView
      if (!realm) throw new Error("Scope deadline requires a document realm")
      const id = realm.setTimeout(() => {
        if (!live()) return
        release()
        if (!this.ended) fn()
      }, ms)
      return () => realm.clearTimeout(id)
    })
  }

  mount<Props extends Record<string, unknown>, Exports extends Record<string, unknown>, Bindings extends keyof Props | "">(
    component: Component<Props, Exports, Bindings>, props: NoInfer<Props>, where: ScopeMountTarget
  ): Dispose {
    return this.acquire(() => {
      if (!this.options.mount) throw new Error("Scope mounting port is unavailable")
      return this.options.mount.mount(component, props, where)
    })
  }

  dispose(): void {
    if (this.ended) return
    this.ended = true
    for (const release of [...this.resources]) release()
  }
}
