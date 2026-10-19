<script lang="ts">
  // One shared (not per-account) option inside a feature's settings.
  import Switch from "./Toggle.svelte";

  let {
    label,
    hint = "",
    tag = "",
    checked = $bindable(false),
    disabled = false,
  }: { label: string; hint?: string; tag?: string; checked?: boolean; disabled?: boolean } = $props();
  const id = `opt-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="flex items-start justify-between gap-4 py-1.5">
  <label for={id} class="min-w-0 text-sm">
    <span>{label}</span>
    {#if tag}<span class="ml-1 rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 uppercase dark:text-amber-400">{tag}</span>{/if}
    {#if hint}<span class="text-muted-foreground block text-xs">{hint}</span>{/if}
  </label>
  <Switch {id} bind:checked {disabled} size="sm" class="mt-0.5" />
</div>
