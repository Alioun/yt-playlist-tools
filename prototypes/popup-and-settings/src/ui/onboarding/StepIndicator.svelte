<script lang="ts">
  // First run's three steps (ticket 09): Pick features › Before you start › Finish setting up.
  import Check from "@lucide/svelte/icons/check";
  let { current }: { current: 1 | 2 | 3 } = $props();
  const steps = ["Pick features", "Before you start", "Finish setting up"];
</script>

<ol class="flex items-center gap-2 text-[13px]" aria-label="Setup steps">
  {#each steps as label, i (label)}
    {@const n = i + 1}
    <li class="flex items-center gap-2" aria-current={n === current ? "step" : undefined}>
      <span
        class="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors
          {n < current ? 'bg-success text-white dark:text-background' : n === current ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}"
      >
        {#if n < current}<Check class="size-3.5" strokeWidth={3} />{:else}{n}{/if}
      </span>
      <span class="font-medium whitespace-nowrap {n === current ? 'text-foreground' : 'text-muted-foreground'}">{label}</span>
    </li>
    {#if n < steps.length}
      <li aria-hidden="true" class="h-px w-6 shrink-0 sm:w-10 {n < current ? 'bg-success/60' : 'bg-border'}"></li>
    {/if}
  {/each}
</ol>
