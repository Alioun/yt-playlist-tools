import type { Component } from "svelte"
import type { ScopeMountPort } from "../core/scope"
import { svelteScopeMount } from "./scope-mount"

declare const component: Component<{ label: string; destroyed(): void }, {}, "">
declare const target: Element
function probes() {
  const port: ScopeMountPort = svelteScopeMount(() => {})
  port.mount(component, { label: "Typed fixture", destroyed() {} }, target)
  // @ts-expect-error The adapter does not accept numeric labels.
  port.mount(component, { label: 5, destroyed() {} }, target)
  // @ts-expect-error A component is a Svelte Component, not an arbitrary renderer.
  port.mount(() => document.createElement("button"), {}, target)
  // @ts-expect-error Asynchronous Svelte teardown needs an error sink.
  svelteScopeMount()
}
void probes
