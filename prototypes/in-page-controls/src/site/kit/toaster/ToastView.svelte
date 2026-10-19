<script lang="ts">
  // The toast's look, in YouTube's own snackbar style (measured live, 2026-10-19): bottom left with a 16 px margin,
  // 288 px wide at least, an inverted surface (#0f0f0f on light YouTube, #f1f1f1 on dark), 8 px radius, no border, a
  // soft 24 px shadow, 14/20 Roboto with 12 px around the text, and a text button in the inverse call-to-action blue.
  // Ours wraps up to 568 px for longer copy. Failures get an error glyph and role=alert, never colour alone (ticket 12).
  // Toasts the user didn't ask for (auto-add, notices) start with the extension's small mark (variant A).
  import Icon from "../icons/Icon.svelte";
  import type { Toast } from "./toaster.svelte";

  let {
    t,
    mark = true,
    fs = false,
    fixed = true,
    onaction,
    onundo,
    ondismiss,
    onhover,
    onfocus,
  }: {
    t: Toast;
    mark?: boolean;
    fs?: boolean;
    fixed?: boolean;
    onaction?: () => void;
    onundo?: () => void;
    ondismiss?: () => void;
    onhover?: (on: boolean) => void;
    onfocus?: (on: boolean) => void;
  } = $props();
</script>

<div
  class="toast"
  class:fixed
  class:fs
  role={t.failure ? "alert" : "status"}
  onpointerenter={() => onhover?.(true)}
  onpointerleave={() => onhover?.(false)}
  onfocusin={() => onfocus?.(true)}
  onfocusout={() => onfocus?.(false)}
>
  {#if t.failure}
    <span class="lead err" aria-label="Error"><Icon name="error" size={24} /></span>
  {:else if t.unprompted && mark}
    <span class="lead mark" title="Playlist Pigeon"><Icon name="mark" size={20} /></span>
  {/if}
  <span class="text">{t.text}</span>
  {#if t.pending}<span class="spin" aria-hidden="true"></span>{/if}
  {#if t.undo}
    <button type="button" class="act" disabled={t.undoing} onclick={() => onundo?.()}>{t.undoing ? "Undoing…" : "Undo"}</button>
  {:else if t.action}
    <button type="button" class="act" onclick={() => onaction?.()}>{t.action.label}</button>
  {/if}
  {#if t.sticky}
    <button type="button" class="x" aria-label="Dismiss" onclick={() => ondismiss?.()}><Icon name="close" size={24} /></button>
  {/if}
</div>

<style>
  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    min-width: 288px;
    max-width: min(568px, calc(100vw - 32px));
    padding: 4px 8px 4px 12px;
    border-radius: 8px;
    background: var(--pt-inv);
    color: var(--pt-inv-text);
    box-shadow: 0 0 24px 0 rgba(0, 0, 0, 0.1);
    font: 400 1.4rem/2rem var(--pt-font);
    pointer-events: auto;
    box-sizing: border-box;
  }
  .toast.fixed {
    position: fixed;
    left: 0;
    bottom: 0;
    margin: 16px;
    z-index: 2300;
    animation: pt-in 0.3s cubic-bezier(0.05, 0, 0, 1);
  }
  /* In fullscreen (YouTube makes <html> fullscreen, so our layer stays visible), sit above the player's controls. */
  .toast.fixed.fs {
    margin: 0;
    left: 24px;
    bottom: 88px;
  }
  .text {
    flex: 1;
    padding: 8px 0;
    overflow-wrap: anywhere;
  }
  .lead {
    display: flex;
    margin-right: -2px;
  }
  .lead.mark {
    opacity: 0.9;
  }
  /* YouTube's error indicator, inverted with the surface: #f57 on the dark toast, #c30027 on the light one. */
  .lead.err {
    color: var(--yt-sys-color-baseline--error-indicator-inverse, #f57);
  }
  :global(:host([dark])) .lead.err {
    color: var(--yt-sys-color-baseline--error-indicator-inverse, #c30027);
  }
  .act {
    flex: none;
    height: 36px;
    padding: 0 12px;
    border: 0;
    border-radius: 18px;
    background: transparent;
    color: var(--pt-inv-cta);
    font: 500 1.4rem/3.6rem var(--pt-font);
    cursor: pointer;
  }
  .act:hover {
    background: rgba(127, 127, 127, 0.2);
  }
  .act:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .x {
    flex: none;
    width: 36px;
    height: 36px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .x:hover {
    background: rgba(127, 127, 127, 0.2);
  }
  button:focus-visible {
    outline: 2px solid var(--pt-inv-cta);
    outline-offset: -2px;
  }
  .spin {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-right-color: transparent;
    animation: pt-spin 0.8s linear infinite;
    margin-right: 8px;
  }
  @keyframes pt-in {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
  }
  @keyframes pt-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .toast.fixed {
      animation: none;
    }
  }
</style>
