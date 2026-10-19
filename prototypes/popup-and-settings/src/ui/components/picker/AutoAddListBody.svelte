<script lang="ts">
  // An account's auto-add playlists (mounted by AutoAddList once consent is given), on the one PickerModel in "many" mode: search (sticky, for long lists), a tick
  // per playlist, a pill on each ticked one for its options (Takes, its own percentage, channel filter), Missing /
  // Full marks with Remove (ticket 12), and New playlist, which creates an empty playlist and ticks it.
  // No fixed-height scroll box (a 1.5.0 Friction item): the list grows and the page or popup scrolls.
  import Search from "@lucide/svelte/icons/search";
  import Plus from "@lucide/svelte/icons/plus";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import History from "@lucide/svelte/icons/history";
  import Lock from "@lucide/svelte/icons/lock";
  import Thumb from "./Thumb.svelte";
  import Meta from "./Meta.svelte";
  import NewPlaylistForm from "./NewPlaylistForm.svelte";
  import KeyCombo from "../KeyCombo.svelte";
  import PlaylistOptions, { optionsSummary } from "../PlaylistOptions.svelte";
  import { PickerModel } from "$shared/picker/model.svelte";
  import type { AccountId } from "$shared/model/types";
  import { act, labelOf, optionsOf, setupOf, setupsReadOnly, ui } from "$lib/view.svelte";
  import { openExternal } from "$lib/nav";
  import { autoAddSource } from "./sources";
  import { Button } from "$ui/components/ui/button/index.js";

  let {
    acct,
    density = "page",
    readOnly: forcedReadOnly = false,
    initialOpen = null,
  }: { acct: AccountId; density?: "popup" | "page"; readOnly?: boolean; initialOpen?: string | null } = $props();

  // svelte-ignore state_referenced_locally
  const model = new PickerModel({ source: autoAddSource(acct), site: "youtube", mode: "many" });
  let creating = $state(false);
  // svelte-ignore state_referenced_locally
  let open = $state<string | null>(initialOpen);
  const setup = $derived(setupOf(acct));
  const name = $derived(labelOf(acct).name);
  const readOnly = $derived(forcedReadOnly || setupsReadOnly() || model.fromCache);
  // Chosen playlists marked Missing or Full come first: they need the user, and a missing one isn't in YouTube's
  // list any more, so it would otherwise sit at the end of a long list. Nothing else moves when ticked.
  const rows = $derived([...model.rows].sort((a, b) => Number(!!(b.mark && b.checked)) - Number(!!(a.mark && a.checked))));
  const chosen = $derived(setup?.autoAdd.length ?? 0);
  const pop = $derived(density === "popup");
</script>

{#if setup?.notLoadedHere}
  <div class="bg-muted/50 rounded-xl border px-3 py-3 text-[12.5px]">
    <p><span class="font-medium">{setup.autoAdd.length} auto-add playlists</span> · Open YouTube as {name} to see them.</p>
    <p class="text-muted-foreground mt-0.5 text-xs">This setup came from settings sync; its playlists load once {name} is open in this browser.</p>
    <Button class="mt-2" size="sm" variant="outline" onclick={() => openExternal("youtube")}>Open YouTube</Button>
  </div>
{:else}
  <div class="space-y-2">
    <div class="bg-card sticky top-0 z-10 -mx-1 space-y-2 px-1 pt-0.5 pb-1.5 {pop ? '' : 'pt-1'}">
      <div class="flex items-center gap-2">
        <span class="min-w-0 flex-1 truncate {pop ? 'text-xs' : 'text-[13px]'} font-medium">
          Playlists for {name}
          <span class="text-muted-foreground font-normal">· {chosen ? `${chosen} chosen` : "none yet"}</span>
        </span>
        {#if !readOnly}
          <Button size="xs" variant="ghost" onclick={() => (creating = !creating)}><Plus />New</Button>
        {/if}
      </div>
      {#if model.all.length > 8}
        <label class="border-input bg-card focus-within:border-ring focus-within:ring-ring/40 flex h-8 items-center gap-2 rounded-lg border px-2.5 focus-within:ring-3">
          <Search class="text-muted-foreground size-3.5 shrink-0" />
          <input
            bind:value={model.query}
            class="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none"
            placeholder="Search {model.all.length} playlists"
            aria-label="Search playlists"
          />
        </label>
      {/if}
      {#if model.fromCache}
        <p class="text-muted-foreground flex items-center gap-1 text-[11.5px]"><History class="size-3" />Saved list from {model.savedAgo}. Open YouTube to change it.</p>
      {:else if setupsReadOnly()}
        <p class="text-muted-foreground flex items-center gap-1 text-[11.5px]"><Lock class="size-3" />Private window: change these in a normal window.</p>
      {:else if !setup}
        <p class="text-muted-foreground text-[11.5px]">Nothing is saved for {name} until you tick one.</p>
      {/if}
    </div>

    {#if creating}
      <div class="bg-muted/45 rounded-xl border p-3">
        <NewPlaylistForm
          {acct}
          existing={model.all.map((p) => p.title)}
          create={(t, p) => model.create(t, p)}
          onclose={() => (creating = false)}
          oncreated={() => (creating = false)}
        />
      </div>
    {/if}

    {#if model.loading}
      <div class="space-y-2 py-1" aria-hidden="true">
        {#each [0, 1, 2, 3] as i (i)}<div class="bg-muted h-8 animate-pulse rounded-lg" style="opacity:{1 - i * 0.2}"></div>{/each}
      </div>
    {:else}
      <ul class="-mx-1.5 {pop ? '' : 'space-y-0.5'}">
        {#each rows as r (r.playlist.id)}
          {@const opts = optionsOf(acct, r.playlist.id)}
          {@const isOpen = open === r.playlist.id && r.checked}
          <li class="rounded-lg {isOpen ? 'bg-muted/40' : ''}">
            <div class="flex items-center gap-1.5 pr-1.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={r.checked}
                disabled={readOnly}
                class="hover:bg-muted/70 flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-default disabled:hover:bg-transparent {pop ? 'py-1.5' : 'py-2'}"
                onclick={() => (r.checked ? model.untick(r.playlist.id) : model.tick(r.playlist.id))}
              >
                <span
                  class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors
                    {r.checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card'} {readOnly ? 'opacity-60' : ''}"
                  aria-hidden="true">{#if r.checked}<Check class="size-3.5" strokeWidth={3} />{/if}</span
                >
                <Thumb playlist={r.playlist} size={pop ? "sm" : "md"} />
                <span class="min-w-0 flex-1">
                  <span class="block truncate {pop ? 'text-[12.5px]' : 'text-[13px]'} leading-[18px] font-medium">{r.playlist.title}</span>
                  {#if pop && r.checked && !r.mark}
                    <!-- Popup: the options' summary takes the second line, so the title keeps the row's width. -->
                    <span class="block truncate text-[11.5px] leading-4 {isOpen ? 'text-primary' : 'text-muted-foreground'}"
                      >{optionsSummary(opts, setup?.filters[r.playlist.id])}</span
                    >
                  {:else}
                    <Meta playlist={r.playlist} />
                  {/if}
                </span>
              </button>
              {#if r.key && !pop}<KeyCombo key={r.key} os={ui.s.env.os} size="xs" class="text-muted-foreground" />{/if}
              {#if r.mark}
                <span class="bg-destructive-soft text-destructive shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold">{r.mark === "full" ? "Full" : "Missing"}</span>
                {#if r.checked && !readOnly}
                  <button
                    type="button"
                    class="text-muted-foreground hover:text-foreground shrink-0 text-[11.5px] font-medium hover:underline"
                    onclick={() => act({ kind: "removeChosen", acct, playlist: r.playlist.id })}>Remove</button
                  >
                {/if}
              {:else if r.checked && pop}
                <button
                  type="button"
                  class="inline-flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors
                    {isOpen ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
                  aria-expanded={isOpen}
                  aria-label="Options for {r.playlist.title}"
                  title="Options"
                  onclick={() => (open = isOpen ? null : r.playlist.id)}><SlidersHorizontal class="size-3.5" /></button
                >
              {:else if r.checked}
                <button
                  type="button"
                  class="inline-flex h-6 shrink-0 items-center max-w-[220px] gap-0.5 rounded-full border px-2 text-[11px] font-medium transition-colors
                    {isOpen ? 'border-primary/40 bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}"
                  aria-expanded={isOpen}
                  onclick={() => (open = isOpen ? null : r.playlist.id)}
                >
                  <span class="truncate">{optionsSummary(opts, setup?.filters[r.playlist.id])}</span>
                  <ChevronDown class="size-3 shrink-0 transition-transform {isOpen ? 'rotate-180' : ''}" />
                </button>
              {/if}
            </div>
            {#if isOpen}
              <div class="px-1.5 pt-1 pb-2">
                <PlaylistOptions {acct} playlist={r.playlist.id} />
              </div>
            {/if}
          </li>
        {:else}
          <li class="text-muted-foreground px-2 py-4 text-center text-[12.5px]">No playlist matches “{model.query}”.</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
