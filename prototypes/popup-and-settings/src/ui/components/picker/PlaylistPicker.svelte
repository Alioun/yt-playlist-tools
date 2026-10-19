<script lang="ts">
  // The one playlist picker (tickets 08, 12, 26), on the one PickerModel (ticket 17). The popup shows it as a sheet,
  // settings and onboarding in a popover; the rows, states and copy are the same everywhere:
  //   - search focused on open; Watch later first on YouTube; YouTube's own Save-dialog order;
  //   - save mode: a teal check means "already in it" (membership, read fresh on open; rows work before it arrives);
  //     ticking adds and reports on the row (busy, then checked, or "Couldn't save"); unticking removes
  //     (PROVISIONAL, ticket 26); the pin makes a playlist the one-click (quick-save) playlist;
  //   - choose mode: one playlist for a purpose, a violet check, Missing / Full with Remove;
  //   - every row shows its playlist shortcut's key;
  //   - New playlist at the bottom, always reachable.
  import { onMount } from "svelte";
  import X from "@lucide/svelte/icons/x";
  import Search from "@lucide/svelte/icons/search";
  import Plus from "@lucide/svelte/icons/plus";
  import Pin from "@lucide/svelte/icons/pin";
  import Check from "@lucide/svelte/icons/check";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import History from "@lucide/svelte/icons/history";
  import Thumb from "./Thumb.svelte";
  import Meta from "./Meta.svelte";
  import NewPlaylistForm from "./NewPlaylistForm.svelte";
  import KeyCombo from "../KeyCombo.svelte";
  import { PickerModel, type PickerRow } from "$shared/picker/model.svelte";
  import { act, setupsReadOnly, ui } from "$lib/view.svelte";
  import type { PickerRequest } from "./request";
  import { chooseSource, saveSource } from "./sources";

  let { req, onclose, density = "sheet" }: { req: PickerRequest; onclose?: () => void; density?: "sheet" | "popover" } = $props();

  // svelte-ignore state_referenced_locally
  const model = new PickerModel({
    source: req.mode === "save" ? saveSource(req) : chooseSource(req.acct, () => (req.mode === "choose" ? req.selected : null), (p) => req.mode === "choose" && req.onchoose(p)),
    site: req.site,
    mode: req.mode === "save" ? "save" : "choose",
  });

  let creating = $state(false);
  let search: HTMLInputElement | undefined = $state();
  const unit = $derived(req.mode === "save" && req.item.kind === "song" ? "song" : "video");
  const readOnly = $derived(req.mode === "choose" && setupsReadOnly());
  const rows = $derived(model.rows);
  const title = $derived(
    req.mode === "choose" ? req.title : req.setsQuickSave ? (req.site === "music" ? "Save songs to…" : "Save videos to…") : "Save to…",
  );
  const subtitle = $derived(
    req.mode === "choose"
      ? req.subtitle
      : req.setsQuickSave
        ? "Your pick saves it, and one click saves there from now on."
        : `“${req.item.title.length > 40 ? req.item.title.slice(0, 40) + "…" : req.item.title}”`,
  );

  // preventScroll: in a popover the field is focused before it's positioned, and the page would jump to the top.
  onMount(() => search?.focus({ preventScroll: true }));

  function toggle(r: PickerRow) {
    if (r.state === "busy" || readOnly) return;
    if (model.mode === "choose") {
      model.tick(r.playlist.id);
      onclose?.();
      return;
    }
    if (r.checked) model.untick(r.playlist.id);
    else model.tick(r.playlist.id);
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (creating) creating = false;
      else onclose?.();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="bg-popover text-popover-foreground flex h-full min-h-0 flex-col" onkeydown={key} role="dialog" aria-label={title} tabindex="-1">
  <div class="flex items-start gap-2 px-3 pt-3 pb-2">
    <div class="min-w-0 flex-1">
      <h2 class="text-[14px] leading-5 font-semibold">{title}</h2>
      {#if subtitle}<p class="text-muted-foreground truncate text-xs leading-4">{subtitle}</p>{/if}
    </div>
    {#if onclose}
      <button
        type="button"
        class="text-muted-foreground hover:bg-muted hover:text-foreground -mt-0.5 -mr-1 inline-flex size-7 items-center justify-center rounded-lg"
        aria-label="Close"
        onclick={onclose}><X class="size-4" /></button
      >
    {/if}
  </div>

  <div class="px-3 pb-2">
    <label class="border-input bg-card focus-within:border-ring focus-within:ring-ring/40 flex h-8 items-center gap-2 rounded-lg border px-2.5 focus-within:ring-3">
      <Search class="text-muted-foreground size-3.5 shrink-0" />
      <input
        bind:this={search}
        bind:value={model.query}
        class="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        placeholder="Search playlists"
        aria-label="Search playlists"
        onkeydown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            (document.querySelector("[data-picker-row]") as HTMLElement | null)?.focus();
          }
        }}
      />
    </label>
    <div class="text-muted-foreground mt-1.5 flex min-h-4 items-center gap-1.5 text-[11.5px] leading-4" aria-live="polite">
      {#if model.mode === "save" && model.membership === "loading" && !model.loading}
        <LoaderCircle class="size-3 animate-spin" />Checking where this {unit} already is…
      {:else if model.membership === "unavailable"}
        <TriangleAlert class="text-warning size-3" />Couldn't check where this {unit} already is
      {:else if model.fromCache}
        <History class="size-3" />Saved list from {model.savedAgo}
      {:else if readOnly}
        Private window: choices can't be changed here
      {:else if model.mode === "save" && model.membership === "ready" && !model.loading}
        {@const n = model.all.filter((p) => rows.some((r) => r.playlist.id === p.id && r.checked)).length}
        {n ? `Already in ${n} playlist${n === 1 ? "" : "s"}` : `Not in any of your playlists yet`}
      {/if}
    </div>
  </div>

  <ul class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5" role="menu" aria-label="Playlists">
    {#if model.loading}
      {#each [0, 1, 2, 3, 4, 5] as i (i)}
        <li class="flex items-center gap-2.5 px-1.5 py-2" aria-hidden="true">
          <span class="bg-muted size-[18px] animate-pulse rounded-[5px]"></span>
          <span class="bg-muted h-[22px] w-10 animate-pulse rounded-[5px]"></span>
          <span class="bg-muted h-2.5 animate-pulse rounded-full" style="width:{110 - i * 9}px"></span>
        </li>
      {/each}
    {:else}
      {#each rows as r (r.playlist.id)}
        {@const save = model.mode === "save"}
        {@const pinned = save && model.pinned === r.playlist.id}
        <li class="group/row">
          <div class="hover:bg-muted/70 focus-within:bg-muted/70 flex items-center gap-1 rounded-lg pr-1.5">
            <button
              type="button"
              data-picker-row
              role={save ? "menuitemcheckbox" : "menuitemradio"}
              aria-checked={r.checked}
              aria-disabled={readOnly || r.state === "busy" || undefined}
              class="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1.5 pl-1.5 text-left outline-none"
              onclick={() => toggle(r)}
              onkeydown={(e) => {
                const li = (e.currentTarget as HTMLElement).closest("li");
                if (e.key === "ArrowDown") (li?.nextElementSibling?.querySelector("[data-picker-row]") as HTMLElement | null)?.focus();
                else if (e.key === "ArrowUp") (li?.previousElementSibling?.querySelector("[data-picker-row]") as HTMLElement | null ?? search)?.focus();
                else return;
                e.preventDefault();
              }}
            >
              <span
                class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors
                  {r.state === 'busy'
                  ? 'border-transparent'
                  : r.checked
                    ? save
                      ? 'border-success bg-success text-white dark:text-background'
                      : 'border-primary bg-primary text-primary-foreground'
                    : save && model.membership === 'loading'
                      ? 'border-input border-dashed'
                      : 'border-input bg-card'}"
                aria-hidden="true"
              >
                {#if r.state === "busy"}<LoaderCircle class="text-muted-foreground size-4 animate-spin" />
                {:else if r.checked}<Check class="size-3.5" strokeWidth={3} />{/if}
              </span>
              <Thumb playlist={r.playlist} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] leading-[18px] font-medium">{r.playlist.title}</span>
                <Meta playlist={r.playlist} {unit} />
              </span>
            </button>
            {#if r.mark}
              <span class="bg-destructive-soft text-destructive rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold">{r.mark === "full" ? "Full" : "Missing"}</span>
              {#if !save && r.checked && !readOnly}
                <button
                  type="button"
                  class="text-muted-foreground hover:text-foreground text-[11.5px] font-medium hover:underline"
                  onclick={() => act({ kind: "removeChosen", acct: req.acct, playlist: r.playlist.id })}>Remove</button
                >
              {/if}
            {/if}
            {#if r.key}<KeyCombo key={r.key} os={ui.s.env.os} size="xs" class="text-muted-foreground" />{/if}
            {#if save && (pinned || req.mode === "save")}
              <button
                type="button"
                class="inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-opacity
                  {pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100'}"
                title={pinned ? "One-click save goes here" : "Use for one-click save"}
                aria-label={pinned ? `${r.playlist.title} is the one-click playlist` : `Use ${r.playlist.title} for one-click save`}
                aria-pressed={pinned}
                disabled={setupsReadOnly()}
                onclick={() => model.pin(r.playlist.id)}
              >
                <Pin class="size-3.5 {pinned ? 'fill-current' : ''}" />
              </button>
            {/if}
          </div>
          {#if r.error}
            <p class="pb-1 pl-[34px] text-[11.5px] {r.state === 'error' ? 'text-destructive' : 'text-muted-foreground'}">{r.error}</p>
          {/if}
        </li>
      {:else}
        <li class="text-muted-foreground px-3 py-6 text-center text-[12.5px]">
          No playlist matches “{model.query}”.
          <button type="button" class="text-primary mt-1 block w-full font-medium hover:underline" onclick={() => (creating = true)}
            >Create “{model.query.trim()}”</button
          >
        </li>
      {/each}
    {/if}
  </ul>

  <div class="bg-popover shrink-0 border-t px-3 py-2.5 {density === 'popover' ? 'rounded-b-xl' : ''}">
    {#if creating}
      <NewPlaylistForm
        acct={req.acct}
        initial={rows.length ? "" : model.query.trim()}
        existing={model.all.map((p) => p.title)}
        withItem={model.mode === "save"}
        create={(t, p) => model.create(t, p)}
        onclose={() => (creating = false)}
        oncreated={() => {
          creating = false;
          model.query = "";
          if (model.mode === "choose") onclose?.();
        }}
      />
    {:else}
      <button
        type="button"
        class="hover:bg-muted text-foreground -mx-1.5 flex h-8 w-[calc(100%+12px)] items-center gap-2 rounded-lg px-1.5 text-[13px] font-medium disabled:opacity-50"
        disabled={readOnly}
        onclick={() => (creating = true)}
      >
        <span class="bg-accent text-primary inline-flex size-[22px] items-center justify-center rounded-md"><Plus class="size-3.5" /></span>
        New playlist
      </button>
    {/if}
  </div>
</div>
