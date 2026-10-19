<script lang="ts">
  // Progress toward the nearest auto-add goal, in the place of a 24px icon: a pie inside a full outline. (A partial
  // ring read as a loading spinner next to YouTube's buttons, especially icon-only.)
  let { value, size = 24 }: { value: number; size?: number } = $props();
  const C = 2 * Math.PI * 4.25;
  const v = $derived(Math.max(0.04, Math.min(1, value)));
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
  <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6" />
  <circle cx="12" cy="12" r="4.25" fill="none" stroke="currentColor" stroke-width="8.5" stroke-dasharray="{v * C} {C}" transform="rotate(-90 12 12)" />
</svg>

<style>
  svg {
    display: block;
    flex: none;
  }
</style>
