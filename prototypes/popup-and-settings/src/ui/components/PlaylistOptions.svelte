<script lang="ts" module>
  import { filterSummary } from "./ChannelFilterEditor.svelte";
  import type { ChannelFilter, PlaylistOptions as Opts } from "$shared/model/types";
  /** The pill on a ticked auto-add playlist: only what differs from the defaults, else "Options". */
  export function optionsSummary(o: Opts, f: ChannelFilter | undefined): string {
    const parts = [
      o.takes === "shorts" ? "Shorts only" : o.takes === "both" ? "Shorts too" : null,
      o.percent !== null ? `${o.percent} %` : null,
      filterSummary(f),
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Options";
  }
</script>

<script lang="ts">
  // One auto-add playlist's options (ticket 07 and the channel-filters spec): what it takes (Videos / Shorts / Both,
  // Videos by default), when it adds (the shared default, or its own percentage), and its channel filter.
  import PercentField from "./PercentField.svelte";
  import ChannelFilterEditor from "./ChannelFilterEditor.svelte";
  import type { AccountId } from "$shared/model/types";
  import { act, optionsOf, setupsReadOnly, ui } from "$lib/view.svelte";

  let { acct, playlist }: { acct: AccountId; playlist: string } = $props();
  const o = $derived(optionsOf(acct, playlist));
  const readOnly = $derived(setupsReadOnly());
  const takes = [
    ["videos", "Videos"],
    ["shorts", "Shorts"],
    ["both", "Both"],
  ] as const;
</script>

<div class="bg-muted/45 space-y-3.5 rounded-xl border p-3">
  <div class="space-y-1.5">
    <div class="text-xs font-medium">Takes</div>
    <div class="bg-muted grid grid-cols-3 gap-0.5 rounded-lg p-0.5" role="radiogroup" aria-label="What it takes">
      {#each takes as [id, label] (id)}
        <button
          type="button"
          role="radio"
          aria-checked={o.takes === id}
          disabled={readOnly}
          class="h-7 rounded-md text-xs font-medium transition-colors {o.takes === id
            ? 'bg-card text-foreground shadow-soft dark:bg-secondary'
            : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => act({ kind: "playlistOptions", acct, playlist, takes: id })}>{label}</button
        >
      {/each}
    </div>
  </div>

  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <span class="flex-1 text-xs font-medium">Adds at</span>
      <div class="bg-muted grid grid-cols-2 gap-0.5 rounded-lg p-0.5" role="radiogroup" aria-label="When it adds">
        <button
          type="button"
          role="radio"
          aria-checked={o.percent === null}
          disabled={readOnly}
          class="h-6 rounded-md px-2 text-[11.5px] font-medium {o.percent === null ? 'bg-card shadow-soft dark:bg-secondary' : 'text-muted-foreground'}"
          onclick={() => act({ kind: "playlistOptions", acct, playlist, percent: null })}>Default · {ui.s.features.autoAdd.percent} %</button
        >
        <button
          type="button"
          role="radio"
          aria-checked={o.percent !== null}
          disabled={readOnly}
          class="h-6 rounded-md px-2 text-[11.5px] font-medium {o.percent !== null ? 'bg-card shadow-soft dark:bg-secondary' : 'text-muted-foreground'}"
          onclick={() => o.percent === null && act({ kind: "playlistOptions", acct, playlist, percent: Math.min(100, ui.s.features.autoAdd.percent + 40) })}
          >Its own</button
        >
      </div>
    </div>
    {#if o.percent !== null}
      <PercentField compact label="Its required percentage" value={o.percent} disabled={readOnly} onchange={(v) => act({ kind: "playlistOptions", acct, playlist, percent: v })} />
    {/if}
  </div>

  <div class="border-t pt-3">
    <ChannelFilterEditor {acct} {playlist} />
  </div>
</div>
