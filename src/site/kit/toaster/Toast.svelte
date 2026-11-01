<script lang="ts">
  import type { Site } from "../../../shared/contracts"
  import { errorPath, outlineErrorPath } from "../../core/notice/skin"
  import type { Toaster } from "./model"
  import type { ToastView } from "./types"

  let { source, site, document }: { source: Toaster; site: Site; document: Document } = $props()
  let view = $state.raw<ToastView | null>(source.read())
  let container = $state<HTMLDivElement | undefined>()
  $effect(() => source.subscribe(next => { if (!document.hidden) view = next }))
  $effect(() => { if (view) source.presented(view) })
  $effect(() => {
    if (!document.hidden && view && container) {
      const root = container.getRootNode()
      source.pause("focus", root instanceof ShadowRoot && root.activeElement !== null && container.contains(root.activeElement))
    }
  })
  function focusOut(event: FocusEvent) {
    const container = event.currentTarget
    if (container instanceof HTMLElement && event.relatedTarget instanceof Node && container.contains(event.relatedTarget)) return
    source.pause("focus", false)
  }
</script>

{#if view}
  <div bind:this={container} class="toast" role={view.content.tone === "failure" ? "alert" : "status"} aria-atomic="true"
    onpointerenter={() => source.pause("hover", true)} onpointerleave={() => source.pause("hover", false)}
    onfocusin={() => source.pause("focus", true)} onfocusout={focusOut}>
    {#if view.content.tone === "failure"}
      <svg class="glyph error" data-glyph="error" viewBox="0 0 24 24" aria-hidden="true"><path d={site === "music" ? outlineErrorPath : errorPath} /></svg>
    {:else if view.content.tone === "progress"}
      <span class="spinner" data-glyph="pending" aria-hidden="true"></span>
    {:else if view.content.auto && view.content.tone === "confirmation" && site === "www"}
      <svg class="glyph" data-glyph="mark" viewBox="0 0 24 24" aria-hidden="true">
        <defs><mask id={`toast-mark-${view.id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="white" /><circle cx="5.3" cy="3.7" r="0.95" fill="black" />
          <path d="M11.4 9.4 C13.6 8.6 16.4 8.8 18.4 9.9" fill="none" stroke="black" stroke-width="0.9" stroke-linecap="round" />
          <rect x="1" y="15.5" width="22" height="0.9" fill="black" /><rect x="4" y="17.5" width="4" height="3.5" fill="black" />
          <rect x="10" y="17.5" width="4" height="3.5" fill="black" /><rect x="16" y="17.5" width="4" height="3.5" fill="black" />
        </mask></defs>
        <g fill="currentColor" mask={`url(#toast-mark-${view.id})`}>
          <rect x="1" y="13" width="22" height="3" rx="1" /><rect x="2.5" y="15" width="19" height="7.5" rx="1" />
          <path d="M17.6 8.2 L23.4 9.8 L22.9 12.3 L17.3 11.8 Z" /><ellipse cx="12.5" cy="9.6" rx="6.6" ry="3.4" />
          <path d="M3.8 6.1 L10.1 5.5 L11.3 10 L5.3 10.9 Z" /><circle cx="6" cy="4.3" r="3.4" /><path d="M2.9 3.25 L0.6 4.75 L2.9 5.65 Z" />
        </g>
      </svg>
    {/if}
    <span data-toast-text>{view.content.text}</span>
    {#if view.content.action}
      <button type="button" disabled={view.busy} onclick={() => { void view?.act() }}>{view.content.action.label}</button>
    {/if}
    {#if view.dismiss}
      <button type="button" aria-label={view.dismiss.label} onclick={() => view?.dismiss?.run()}>×</button>
    {/if}
  </div>
{/if}
