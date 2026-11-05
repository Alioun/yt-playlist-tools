import type { Component } from "svelte"
import { Scope, type ScopeMountPort } from "./scope"

declare const owner: Scope
declare const target: HTMLButtonElement
declare const component: Component<{ label: string; selected: (value: number) => void }, { reset(): void }, "">
declare const port: ScopeMountPort

function probes() {
  owner.on(target, "click", event => { event.clientX })
  owner.on(document, "keydown", event => { event.key })
  // @ts-expect-error A click handler cannot consume a keyboard event.
  owner.on(target, "click", (event: KeyboardEvent) => { event.key })
  // @ts-expect-error The click payload has no keyboard key.
  owner.on(target, "click", event => { event.key })
  // @ts-expect-error Window event names are checked at the call.
  owner.on(window, "invented-window-event", () => {})
  owner.mount(component, { label: "Typed", selected: value => { value.toFixed() } }, target)
  port.mount(component, { label: "Typed", selected: () => {} }, target)
  // @ts-expect-error Component props retain their required label type.
  owner.mount(component, { label: 4, selected: () => {} }, target)
  // @ts-expect-error Required component props cannot be omitted.
  owner.mount(component, { label: "Missing selected" }, target)
  // @ts-expect-error Component callback props retain the payload type.
  port.mount(component, { label: "Wrong callback", selected: (value: string) => { value.toUpperCase() } }, target)
  // @ts-expect-error A Scope needs its document and cleanup error sink.
  new Scope({ document })
}
void probes
