<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 27). YouTube Music's paper-spinner look: a thin rotating arc.
  let { size = 20, stroke = 2.5 }: { size?: number; stroke?: number } = $props();
  const r = $derived((size - stroke) / 2);
  const c = $derived(2 * Math.PI * r);
</script>

<svg class="spin" width={size} height={size} viewBox="0 0 {size} {size}" aria-hidden="true">
  <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-dasharray="{c * 0.7} {c}" />
</svg>

<style>
  .spin {
    display: block;
    flex: none;
    animation: rot 0.9s linear infinite;
  }
  @keyframes rot {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation-duration: 2.4s;
    }
  }
</style>
