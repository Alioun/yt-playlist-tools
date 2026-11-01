<script lang="ts">
  import clsx from "clsx"
  import Glyph from "./Glyph.svelte"

  let { steps, current, label, formatNumber }: { steps: readonly string[]; current: number; label: string; formatNumber: (value: number) => string } = $props()
</script>

<ol class="flex items-center gap-2 text-[13px]" aria-label={label}>
  {#each steps as step, index (step)}
    {@const n = index + 1}
    <li class="flex items-center gap-2" aria-current={n === current ? "step" : undefined}>
      <span
        aria-hidden="true"
        class={clsx(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
          n < current ? "bg-success dark:text-background text-white" : n === current ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {#if n < current}<Glyph name="check" class="size-3.5" strokeWidth={3} />{:else}{formatNumber(n)}{/if}
      </span>
      <span class={clsx("font-medium whitespace-nowrap", n === current ? "text-foreground" : "text-muted-foreground")}>{step}</span>
    </li>
    {#if n < steps.length}
      <li aria-hidden="true" class={clsx("h-px w-6 shrink-0 sm:w-10", n < current ? "bg-success/60" : "bg-border")}></li>
    {/if}
  {/each}
</ol>
