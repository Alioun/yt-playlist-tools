// THROWAWAY PROTOTYPE (ticket 14; ticket 17's `$kit`). What feature files import from the kit. In the dev build this
// module is linked, not bundled: features map `$kit` to globalThis.__pp.kit.lib.
export { default as Icon } from "./icons/Icon.svelte";
export { I, type IconName } from "./icons/icons";
export { default as IconButton } from "./components/IconButton.svelte";
export { default as SplitButton } from "./components/SplitButton.svelte";
export { default as StatusPill } from "./components/StatusPill.svelte";
export { default as Ring } from "./components/Ring.svelte";
export { showToast, updateToast, dismiss, undoKey, toasts, recheck } from "./toaster/toaster.svelte";
export { themeVariablesPresent } from "./host";
// Prototype stand-ins for the tab view and the background (they'd be ctx.view, ctx.add, ctx.run in the product).
export * from "../proto/view.svelte";
export * as flows from "../proto/flows";
