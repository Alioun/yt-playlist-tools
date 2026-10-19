<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). Where our one toast shows: bottom-left, 12 px from the left edge and 12 px
  // above the player bar or Wiz miniplayer, the same spot as YouTube Music's own toasts, in fullscreen too.
  import ToastView from "./ToastView.svelte";
  import { toaster, runAction, dismiss, setHover, setFocus } from "./toaster.svelte";

  let { bottom = 84, left = 12 }: { bottom?: number; left?: number } = $props();
  const t = $derived(toaster.current);
</script>

<div class="layer" style="left:{left}px; bottom:{bottom}px" aria-live="polite">
  {#if t}
    {#key t.id}
      <ToastView
        kind={t.kind}
        text={t.text}
        actionLabel={t.action?.label}
        busy={t.busy}
        onaction={() => runAction()}
        onclose={() => dismiss(t.id)}
        onpointerenter={() => setHover(true)}
        onpointerleave={() => setHover(false)}
        onfocusin={() => setFocus(true)}
        onfocusout={() => setFocus(false)}
      />
    {/key}
  {/if}
</div>

<style>
  .layer {
    position: fixed;
    z-index: 2100;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    pointer-events: none;
  }
</style>
