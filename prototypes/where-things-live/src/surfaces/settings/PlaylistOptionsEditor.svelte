<script lang="ts">
  // Ticket 07's per-playlist options, shown beside the channel filter: what the playlist takes, and its own
  // required percentage (else the shared default). A half-typed number is never stored.
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { app, ensureSetup, optionsFor, playlistTitle, setupReadOnly, type Takes } from "$lib/state.svelte";
  import type { AccountId } from "$lib/data";
  import { cn } from "$lib/utils";

  let { account, playlistId }: { account: AccountId; playlistId: string } = $props();

  const opts = $derived(optionsFor(playlistId, account));
  const title = $derived(playlistTitle(playlistId, account));
  const ro = $derived(setupReadOnly());
  const threshold = $derived(app.features.autoAdd.threshold);

  let typed = $state<string | null>(null);

  function write(patch: Partial<{ takes: Takes; percent: number | null }>) {
    const s = ensureSetup(account);
    s.playlistOptions[playlistId] = { ...optionsFor(playlistId, account), ...patch };
  }

  function commitTyped() {
    if (typed === null) return;
    const n = Number(typed);
    if (typed.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 100) write({ percent: n });
    typed = null; // invalid or empty: drop it, keep the stored value
  }

  const takesChoices: { id: Takes; label: string }[] = [
    { id: "videos", label: "Videos" },
    { id: "shorts", label: "Shorts" },
    { id: "both", label: "Both" },
  ];
</script>

<div class="w-80 space-y-3 text-sm">
  <p class="font-medium">{title}</p>

  <div>
    <p class="mb-1 text-xs font-medium">Takes</p>
    <div class="bg-muted inline-flex rounded-lg p-0.5" role="radiogroup" aria-label="Takes">
      {#each takesChoices as c (c.id)}
        <button
          type="button"
          role="radio"
          aria-checked={opts.takes === c.id}
          disabled={ro}
          class={cn(
            "rounded-md px-3 py-1 text-xs",
            opts.takes === c.id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
          onclick={() => write({ takes: c.id })}>{c.label}</button
        >
      {/each}
    </div>
  </div>

  <div>
    <p class="mb-1 text-xs font-medium">Required percentage</p>
    <label class="flex items-center gap-2 text-xs">
      <Checkbox
        disabled={ro}
        bind:checked={
          () => opts.percent !== null,
          (v) => write({ percent: v ? (opts.percent ?? threshold) : null })
        }
      />
      Use its own
      {#if opts.percent === null}<span class="text-muted-foreground">(now the default, {threshold} %)</span>{/if}
    </label>
    {#if opts.percent !== null}
      <div class="mt-2 flex items-center gap-2">
        <input
          type="range"
          class="accent-primary flex-1"
          min="0"
          max="100"
          step="5"
          disabled={ro}
          value={opts.percent}
          oninput={(e) => write({ percent: Number((e.currentTarget as HTMLInputElement).value) })}
          aria-label="Required percentage for {title}"
        />
        <input
          class="border-input bg-background w-14 rounded-md border px-1.5 py-0.5 text-right text-xs tabular-nums"
          inputmode="numeric"
          disabled={ro}
          value={typed ?? String(opts.percent)}
          oninput={(e) => (typed = (e.currentTarget as HTMLInputElement).value)}
          onblur={commitTyped}
          onkeydown={(e) => e.key === "Enter" && commitTyped()}
          aria-label="Required percentage for {title}, number"
        />
        <span class="text-xs">%</span>
      </div>
    {/if}
  </div>
</div>
