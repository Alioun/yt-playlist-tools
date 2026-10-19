<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). One toast, drawn like YouTube Music's own tp-yt-paper-toast (measured on
  // music.youtube.com: #f1f1f1, #030303 text, 8 px corners, 0 2px 5px shadow, 14 px Roboto, 288 px minimum).
  import Icon from "./Icon.svelte";
  import Spinner from "./Spinner.svelte";
  import type { ToastKind } from "./toaster.svelte";

  let {
    kind,
    text,
    actionLabel,
    busy = false,
    animate = true,
    onaction,
    onclose,
    onpointerenter,
    onpointerleave,
    onfocusin,
    onfocusout,
  }: {
    kind: ToastKind;
    text: string;
    actionLabel?: string;
    busy?: boolean;
    animate?: boolean;
    onaction?: () => void;
    onclose?: () => void;
    onpointerenter?: () => void;
    onpointerleave?: () => void;
    onfocusin?: () => void;
    onfocusout?: () => void;
  } = $props();
</script>

<div
  class="toast {kind}"
  class:animate
  class:hasact={!!actionLabel || kind === "notice"}
  role={kind === "failure" || kind === "notice" ? "alert" : "status"}
  tabindex="-1"
  {onpointerenter}
  {onpointerleave}
  {onfocusin}
  {onfocusout}
>
  {#if kind === "pending"}
    <span class="lead"><Spinner size={18} /></span>
  {:else if kind === "failure" || kind === "notice"}
    <span class="lead err"><Icon name="error" size={20} /></span>
  {/if}
  <span class="text">{text}</span>
  {#if actionLabel}
    <button class="act" type="button" aria-busy={busy || undefined} onclick={() => onaction?.()}>
      {#if busy}<Spinner size={16} />{:else}{actionLabel}{/if}
    </button>
  {/if}
  {#if kind === "notice"}
    <button class="close" type="button" aria-label="Dismiss" onclick={() => onclose?.()}><Icon name="close" size={20} /></button>
  {/if}
</div>

<style>
  .toast {
    pointer-events: auto;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 288px;
    max-width: min(568px, calc(100vw - 24px));
    min-height: 48px;
    padding: 4px 24px;
    background: #f1f1f1;
    color: #030303;
    border-radius: 8px;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.26);
    font: 400 1.4rem/2rem Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
    outline: none;
    text-align: left;
  }
  .toast.hasact {
    padding-right: 8px;
  }
  .animate {
    animation: up 0.18s cubic-bezier(0.2, 0, 0, 1);
  }
  .lead {
    display: inline-flex;
    margin-left: -8px;
    color: #030303;
  }
  .lead.err {
    color: #c00;
  }
  .text {
    flex: 1;
    padding: 10px 0;
  }
  .act {
    all: unset;
    box-sizing: border-box;
    flex: none;
    min-width: 64px;
    height: 36px;
    padding: 0 12px;
    border-radius: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: 500 1.4rem/2rem Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
    /* YouTube's inverse call-to-action blue on the light toast, as ticket 14's snackbar does. */
    color: #065fd4;
    cursor: pointer;
  }
  .act:hover {
    background: rgba(6, 95, 212, 0.1);
  }
  .act:active {
    background: rgba(0, 0, 0, 0.14);
  }
  .act:focus-visible,
  .close:focus-visible {
    outline: 2px solid #030303;
    outline-offset: -2px;
  }
  .close {
    all: unset;
    box-sizing: border-box;
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #030303;
    cursor: pointer;
    margin-left: -8px;
  }
  .close:hover {
    background: rgba(0, 0, 0, 0.08);
  }
  @keyframes up {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .animate {
      animation: none;
    }
  }
</style>
