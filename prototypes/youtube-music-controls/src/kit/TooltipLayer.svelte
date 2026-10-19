<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). YouTube Music's tooltip look: a small grey label above (or below) the control.
  import { tip } from "./tooltip.svelte";
</script>

{#if tip.visible}
  <div class="tip" class:below={tip.below} style="left:{tip.x}px; top:{tip.y}px" role="tooltip">{tip.text}</div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 2200;
    transform: translate(-50%, -100%);
    background: rgba(97, 97, 97, 0.92);
    color: #fff;
    font: 400 1.2rem/1.8rem Roboto, "Noto Naskh Arabic UI", Arial, sans-serif;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    animation: in 0.1s ease-out;
  }
  .tip.below {
    transform: translate(-50%, 0);
  }
  @keyframes in {
    from {
      opacity: 0;
    }
  }
</style>
