<script lang="ts">
  // The one toast on screen (see toaster.svelte.ts for the rules, ToastView.svelte for the look).
  import ToastView from "./ToastView.svelte";
  import { toasts, dismiss, runUndo, setHover, setFocus } from "./toaster.svelte";

  const t = $derived(toasts.current);
</script>

{#if t}
  {#key t.id}
    <ToastView
      {t}
      mark={toasts.mark}
      fs={!!toasts.fullscreenEl}
      onundo={() => runUndo(t)}
      onaction={() => {
        t.action?.run();
        dismiss(t.id);
      }}
      ondismiss={() => dismiss(t.id)}
      onhover={setHover}
      onfocus={setFocus}
    />
  {/key}
{/if}
