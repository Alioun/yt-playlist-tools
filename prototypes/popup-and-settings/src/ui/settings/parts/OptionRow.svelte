<script lang="ts">
  // One option inside a feature card: a label, an optional line under it, and its control on the right. A switch
  // option is the default; pass `control` for anything else.
  import type { Snippet } from "svelte";
  import { Switch } from "$ui/components/ui/switch/index.js";

  let {
    label,
    description,
    checked,
    onchange,
    disabled = false,
    control,
    children,
    tag,
  }: {
    label: string;
    description?: string;
    checked?: boolean;
    onchange?: (v: boolean) => void;
    disabled?: boolean;
    control?: Snippet;
    children?: Snippet;
    tag?: Snippet;
  } = $props();
</script>

<div class="flex items-start gap-4 px-5 py-3.5">
  <div class="min-w-0 flex-1">
    <div class="flex flex-wrap items-center gap-2 text-sm leading-5 font-medium">{label}{#if tag}{@render tag()}{/if}</div>
    {#if description}<p class="text-muted-foreground mt-0.5 max-w-[62ch] text-[13px] leading-5">{description}</p>{/if}
    {#if children}{@render children()}{/if}
  </div>
  {#if control}
    {@render control()}
  {:else if onchange}
    <Switch class="mt-0.5" size="sm" {checked} {disabled} aria-label={label} onCheckedChange={onchange} />
  {/if}
</div>
