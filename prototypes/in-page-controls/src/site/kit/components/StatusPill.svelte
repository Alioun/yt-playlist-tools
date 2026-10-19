<script lang="ts">
  // The kit's StatusPill (ticket 17): a button in YouTube's action-row style that shows a state and opens a menu.
  // "pill": YouTube's tonal action button (36px, 18px radius, 14px/500, 24px icon), as Share and Save.
  // "compact": the same, icon only (36px circle), for narrow rows and the no-status case.
  // "column": the Shorts action column (48px circle with a label under it).
  import type { Snippet } from "svelte";

  let {
    label,
    tip,
    variant = "pill",
    expanded = false,
    lead,
    onclick,
    onpointerenter,
    element = $bindable(),
  }: {
    label: string;
    tip: string;
    variant?: "pill" | "compact" | "column";
    expanded?: boolean;
    lead: Snippet;
    onclick: (e: MouseEvent) => void;
    onpointerenter?: () => void;
    element?: HTMLButtonElement;
  } = $props();
</script>

<span class="wrap {variant}">
  <button
    bind:this={element}
    type="button"
    class="btn"
    aria-label={variant === "pill" ? undefined : tip}
    aria-haspopup="dialog"
    aria-expanded={expanded}
    onclick={(e) => {
      e.stopPropagation();
      onclick(e);
    }}
    {onpointerenter}
  >
    <span class="lead">{@render lead()}</span>
    {#if variant === "pill"}<span class="label">{label}</span>{/if}
  </button>
  {#if variant === "column"}<span class="col-label" aria-hidden="true">{label}</span>{/if}
  {#if !expanded}<span class="tip" role="tooltip">{tip}</span>{/if}
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
    flex: none;
  }
  /* YouTube's watch-page action buttons (live, 2026-10-19): 40 px, 20 px radius, 14 px/500, 24 px icon + 6 px gap. */
  .btn {
    display: inline-flex;
    align-items: center;
    height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: 20px;
    background: var(--pt-tonal);
    color: var(--pt-text);
    font: 500 1.4rem/4rem var(--pt-font);
    white-space: nowrap;
    cursor: pointer;
  }
  .btn:hover,
  .btn[aria-expanded="true"] {
    background: var(--pt-tonal-hover);
  }
  .btn:focus-visible {
    outline: 2px solid var(--pt-text);
    outline-offset: 2px;
  }
  .lead {
    display: flex;
    margin: 0 6px 0 -6px;
  }
  .compact .btn {
    width: 40px;
    padding: 0;
    justify-content: center;
  }
  .compact .lead {
    margin: 0;
  }
  .column {
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .column .btn {
    width: 48px;
    height: 48px;
    padding: 0;
    justify-content: center;
    border-radius: 50%;
  }
  .column .lead {
    margin: 0;
  }
  /* YouTube's Shorts column: 48 px circles, a 12/18 label 4 px below. */
  .col-label {
    font: 400 1.2rem/1.8rem var(--pt-font);
    color: var(--pt-text);
    white-space: nowrap;
    max-width: 72px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tip {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 3;
    white-space: nowrap;
    padding: 8px;
    border-radius: 4px;
    background: rgba(97, 97, 97, 0.92);
    color: #fff;
    font: 400 1.2rem/1.8rem var(--pt-font);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 0.1s, visibility 0.1s;
  }
  .column .tip {
    top: 50%;
    left: auto;
    right: calc(100% + 8px);
    transform: translateY(-50%);
  }
  .wrap:hover .tip,
  .btn:focus-visible ~ .tip {
    opacity: 1;
    visibility: visible;
    transition-delay: 0.5s;
  }
</style>
