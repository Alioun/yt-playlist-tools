<script lang="ts">
  // The fake storage document, live (the prototype skill's "surface the state"): what Backend.load() returns for
  // this scenario, updated by every change made in any frame.
  import { live } from "./live.svelte";
  let open = $state(false);
  let flash = $state(false);
  let last = 0;
  $effect(() => {
    if (live.changes !== last) {
      last = live.changes;
      flash = true;
      const t = setTimeout(() => (flash = false), 700);
      return () => clearTimeout(t);
    }
  });
  const json = $derived(live.s ? JSON.stringify({ ...live.s, thisTab: live.tab }, null, 2) : "loading…");
</script>

<section class="rounded-lg border border-zinc-200 bg-white">
  <button
    type="button"
    class="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-semibold text-zinc-800"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <span class="font-mono whitespace-nowrap text-zinc-400">{"{}"}</span>
    <span class="min-w-0">State <span class="block text-[11px] font-normal text-zinc-500">The fake storage.local, live</span></span>
    <span class="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[11px] font-normal whitespace-nowrap transition-colors {flash ? 'bg-yellow-200 text-yellow-900' : 'text-zinc-400'}">
      {live.changes} change{live.changes === 1 ? "" : "s"}
    </span>
    <span class="text-zinc-400">{open ? "▾" : "▸"}</span>
  </button>
  {#if open}
    <pre class="max-h-[60vh] overflow-auto border-t border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11px] leading-[1.45] text-zinc-700">{json}</pre>
  {/if}
</section>
