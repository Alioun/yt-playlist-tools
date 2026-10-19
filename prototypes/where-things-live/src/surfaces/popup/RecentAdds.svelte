<script lang="ts">
  // PROPOSAL (new capability, needs the user's go-ahead): recent adds, for toasts that were missed.
  // Collapsed by default at the end of the YouTube tab.
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Check from "@lucide/svelte/icons/check";
  import CircleX from "@lucide/svelte/icons/circle-x";
  import Filter from "@lucide/svelte/icons/filter";
  import Minus from "@lucide/svelte/icons/minus";
  import { app } from "$lib/state.svelte";
  import { cn } from "$lib/utils";

  let open = $state(false);
  let undone = $state<number[]>([]);
</script>

<div class="border-t py-2.5">
  <button type="button" class="flex w-full items-center gap-1.5 text-left text-sm font-medium" onclick={() => (open = !open)} aria-expanded={open}>
    <ChevronRight class={cn("size-4 transition-transform", open && "rotate-90")} />
    Recent adds
    <span class="text-muted-foreground text-xs font-normal">({app.recent.length})</span>
    <span
      class="ml-auto rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
      title="Proposal: a new capability, needs your go-ahead">Proposal: needs your go-ahead</span
    >
  </button>
  {#if open}
    <ul class="mt-2 space-y-1.5">
      {#each app.recent as r (r.id)}
        <li class="flex items-start gap-2 text-xs">
          {#if r.outcome === "added"}<Check class="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
          {:else if r.outcome === "failed"}<CircleX class="text-destructive mt-0.5 size-3.5 shrink-0" />
          {:else if r.outcome === "filtered"}<Filter class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
          {:else}<Minus class="text-muted-foreground mt-0.5 size-3.5 shrink-0" />{/if}
          <span class="min-w-0 flex-1">
            <span class={cn("block", undone.includes(r.id) && "line-through opacity-60")}>{r.text}</span>
            <span class="text-muted-foreground">{r.when}</span>
          </span>
          {#if r.undo && !undone.includes(r.id)}
            <button type="button" class="text-primary shrink-0 hover:underline" onclick={() => (undone = [...undone, r.id])}>Undo</button>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="text-muted-foreground mt-2 text-[11px]">For toasts you missed. Proposal: a new capability, needs your go-ahead.</p>
  {/if}
</div>
