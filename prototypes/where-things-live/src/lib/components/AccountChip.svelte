<script lang="ts">
  import { accounts, type AccountId } from "$lib/data";
  import { cn } from "$lib/utils";

  let {
    account,
    detail = false,
    class: className = "",
  }: { account: AccountId; detail?: boolean; class?: string } = $props();
  const a = $derived(accounts[account]);
</script>

<span class={cn("inline-flex min-w-0 items-center gap-2", className)}>
  <span class={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white", a.color)}>
    {a.initial}
  </span>
  <span class="min-w-0 leading-tight">
    <span class="block truncate text-sm font-medium">{a.name}</span>
    {#if detail}<span class="text-muted-foreground block truncate text-xs">{a.detail}</span>{/if}
  </span>
</span>
