<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import { display, type ShortcutTarget } from "../../shared/keys"
  import type { KeyRecorderController } from "./controller"
  import type { KeyRecorderText } from "./text"
  import { recorderEvents } from "./dom"
  let { controller: owned, text, title, targetName, os, browser }: {
    controller: KeyRecorderController
    text: KeyRecorderText
    title: string
    targetName: (target: ShortcutTarget) => string
    os: "macos" | "windows" | "linux"
    browser: "Chrome" | "Firefox"
  } = $props()
  // The recorder owns its controller and disposes it on destroy, so a different controller needs a new mount.
  const controller = untrack(() => owned)
  let view = $state(controller.view())
  const unsubscribe = controller.subscribe(value => { view = value })
  onDestroy(() => { unsubscribe(); controller.dispose() })
  function focusConflict(element: HTMLElement) {
    const previous = element.ownerDocument.activeElement
    element.querySelector<HTMLButtonElement>("button")?.focus()
    return { destroy() { if (previous instanceof HTMLElement && previous.isConnected) previous.focus() } }
  }
</script>

<div use:recorderEvents={controller} class="key-recorder">
  <span>{title}</span>
  <button type="button" aria-label={text.record(title)} disabled={view.busy} onclick={() => controller.dispatch({ kind: "start" })}>
    <kbd>{view.label}</kbd>
  </button>
  <button type="button" aria-label={text.clear(title)} disabled={view.busy || view.recorder.key === null} onclick={() => controller.dispatch({ kind: "clear" })}>×</button>
  <p aria-live="polite">{[view.hint, view.busy ? text.saving : ""].filter(Boolean).join(" ")}</p>
  {#if view.conflict}
    <div use:focusConflict role="dialog" aria-label={text.conflictLabel} aria-modal="true" tabindex="-1">
      <p>{text.conflict(display(view.conflict.candidate, os), view.conflict.observations.map(row => targetName(row.target)))}</p>
      <button type="button" onclick={() => controller.dispatch({ kind: "use-here" })}>{text.useHere}</button>
      <button type="button" onclick={() => controller.dispatch({ kind: "cancel" })}>{text.cancel}</button>
    </div>
  {/if}
  {#each view.warnings as warning}<p>{text.warning(warning, view.label, browser)}</p>{/each}
  {#if view.commands === "unavailable"}<p>{text.commandsUnavailable}</p>{/if}
  {#if view.answer?.kind === "refused"}<p role="status">{text.answer(view.answer.reason)}</p>{/if}
</div>

<style>
  .key-recorder { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; }
  .key-recorder > p { flex-basis: 100%; margin: 0; }
  kbd { font: inherit; }
  [role="dialog"] { flex-basis: 100%; border: 1px solid currentColor; padding: .75rem; }
</style>
