<script lang="ts">
  import { onDestroy } from "svelte"
  import { display, type ShortcutTarget, type ShortcutWarning } from "../../shared/keys"
  import type { KeyRecorderController } from "./controller"
  import type { KeySettingRefusal } from "../../shared/contracts/key-settings"
  import { recorderEvents } from "./dom"
  let { controller, title, targetName, os, browser }: {
    controller: KeyRecorderController
    title: string
    targetName: (target: ShortcutTarget) => string
    os: "macos" | "windows" | "linux"
    browser: "Chrome" | "Firefox"
  } = $props()
  let view = $state(controller.view())
  const unsubscribe = controller.subscribe(value => { view = value })
  onDestroy(() => { unsubscribe(); controller.dispose() })
  function focusConflict(element: HTMLElement) {
    const previous = element.ownerDocument.activeElement
    element.querySelector<HTMLButtonElement>("button")?.focus()
    return { destroy() { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() } }
  }
  function refusalText(reason: KeySettingRefusal): string {
    switch (reason) {
      case "stale": return "This shortcut changed elsewhere. Record it again."
      case "missing-target": return "This shortcut has been removed."
      case "limit": return "You can keep up to 20 playlist shortcuts."
      case "expired": return "Undo has expired."
      case "sync-full": return "Sync is full. Free some space before saving."
      case "update-needed": return "Update the extension before changing this key."
      case "unconfirmed": return "The save could not be confirmed. Reload before editing again."
      case "rejected": return "The key could not be saved."
      case "invalid": return "This key cannot be saved."
      case "unavailable": return "Key settings are unavailable. Try again after reloading."
    }
  }
  function warningText(warning: ShortcutWarning): string {
    if (warning.kind === "command") return `Your browser uses ${view.label} for ${warning.command} (Keys from any tab), so this shortcut never reaches the page.`
    if (warning.kind === "browser") return `${browser} uses ${view.label} to ${warning.action}. This shortcut replaces it on YouTube pages.`
    const site = warning.site === "www" ? "YouTube" : "YouTube Music"
    return `${site} uses ${view.label} for ${warning.action}. This shortcut replaces it on ${site}.`
  }
</script>

<div use:recorderEvents={controller} class="key-recorder">
  <span>{title}</span>
  <button type="button" aria-label={`Record ${title}`} disabled={view.busy} onclick={() => controller.dispatch({ kind: "start" })}>
    <kbd>{view.label}</kbd>
  </button>
  <button type="button" aria-label={`Clear ${title}`} disabled={view.busy || view.recorder.key === null} onclick={() => controller.dispatch({ kind: "clear" })}>×</button>
  <p aria-live="polite">{view.hint}{view.busy ? " Saving…" : ""}</p>
  {#if view.conflict}
    <div use:focusConflict role="dialog" aria-label="Shortcut already used" aria-modal="true" tabindex="-1">
      <p>{display(view.conflict.candidate, os)} is already used by {view.conflict.observations.map(row => targetName(row.target)).join(", ")}.</p>
      <button type="button" onclick={() => controller.dispatch({ kind: "use-here" })}>Use it here</button>
      <button type="button" onclick={() => controller.dispatch({ kind: "cancel" })}>Cancel</button>
    </div>
  {/if}
  {#each view.warnings as warning}<p>{warningText(warning)}</p>{/each}
  {#if view.commands === "unavailable"}<p>Browser command keys are unavailable. Command clashes could not be checked.</p>{/if}
  {#if view.answer?.kind === "refused"}<p role="status">{refusalText(view.answer.reason)}</p>{/if}
</div>

<style>
  .key-recorder { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .key-recorder > p { flex-basis: 100%; margin: 0; }
  kbd { font: inherit; }
  [role="dialog"] { flex-basis: 100%; border: 1px solid currentColor; padding: .75rem; }
</style>
