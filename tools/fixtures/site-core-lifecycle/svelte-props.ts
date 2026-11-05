import Owned from "./Owned.svelte"
import type { Scope } from "../../../src/site/core/scope"
declare const scope: Scope
declare const target: Element
function probes() {
  scope.mount(Owned, { label: "Real component props", destroyed() {} }, target)
  // @ts-expect-error svelte-check must preserve the real component's label type.
  scope.mount(Owned, { label: 5, destroyed() {} }, target)
  // @ts-expect-error The real component requires its teardown callback.
  scope.mount(Owned, { label: "Missing callback" }, target)
}
void probes
