<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import { display, type ShortcutTarget } from "../../shared/keys"
  import type { KeyRecorderController } from "./controller"
  import type { KeyRecorderText } from "./text"
  import { recorderEvents } from "./dom"
  import Button from "../components/Button.svelte"
  import Glyph from "../components/Glyph.svelte"
  let { controller: owned, text, title, showTitle = true, targetName, os, browser }: {
    controller: KeyRecorderController
    text: KeyRecorderText
    title: string
    /** A table row that names the shortcut in its own cell hides the recorder's title; it still labels the buttons. */
    showTitle?: boolean
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

<div use:recorderEvents={controller} class="flex flex-wrap items-center gap-2">
  {#if showTitle}<span class="min-w-0 flex-1 text-sm">{title}</span>{/if}
  <span class="inline-flex items-center gap-0.5">
    <button
      type="button"
      aria-label={text.record(title)}
      disabled={view.busy}
      data-recording={view.recorder.kind === "recording" ? "" : undefined}
      class="focus-visible:ring-ring/40 border-input bg-card inline-flex min-h-7 items-center rounded-md border px-2 font-mono text-[12.5px] outline-none focus-visible:ring-3 data-recording:border-primary data-recording:text-primary disabled:opacity-60"
      onclick={() => controller.dispatch({ kind: "start" })}
    ><kbd class="font-[inherit]">{view.label}</kbd></button>
    {#if view.recorder.kind !== "recording" && view.recorder.key !== null}
      <button
        type="button"
        aria-label={text.clear(title)}
        disabled={view.busy}
        class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/40 inline-flex size-6 items-center justify-center rounded outline-none focus-visible:ring-3"
        onclick={() => controller.dispatch({ kind: "clear" })}
      ><Glyph name="x" class="size-3.5" /></button>
    {/if}
  </span>
  <p aria-live="polite" class="text-muted-foreground basis-full text-[12px] empty:hidden">{[view.hint, view.busy ? text.saving : ""].filter(Boolean).join(" ")}</p>
  {#if view.conflict}
    <div use:focusConflict role="dialog" aria-label={text.conflictLabel} aria-modal="true" tabindex="-1" class="border-warning-border bg-warning-soft basis-full rounded-lg border p-3 text-sm">
      <p>{text.conflict(display(view.conflict.candidate, os), view.conflict.observations.map(row => targetName(row.target)))}</p>
      <div class="mt-2 flex gap-2">
        <Button size="sm" onclick={() => controller.dispatch({ kind: "use-here" })}>{text.useHere}</Button>
        <Button size="sm" variant="outline" onclick={() => controller.dispatch({ kind: "cancel" })}>{text.cancel}</Button>
      </div>
    </div>
  {/if}
  {#each view.warnings as warning}<p class="text-muted-foreground basis-full text-[12px]">{text.warning(warning, view.label, browser)}</p>{/each}
  {#if view.commands === "unavailable"}<p class="text-muted-foreground basis-full text-[12px]">{text.commandsUnavailable}</p>{/if}
  {#if view.answer?.kind === "refused"}<p role="status" class="text-destructive basis-full text-[12px]">{text.answer(view.answer.reason)}</p>{/if}
</div>
