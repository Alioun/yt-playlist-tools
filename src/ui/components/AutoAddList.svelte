<script lang="ts">
  import clsx from "clsx"
  import type { Snippet } from "svelte"
  import type { I18n } from "../../shared/i18n"
  import type { AutoAddPlaylist, Filter } from "../../shared/model/types"
  import type { Snapshot } from "../../shared/model/settings-view"
  import type { PlaylistId } from "../../shared/model/validation"
  import type { PickerModel, PickerRow } from "../../shared/picker/model.svelte"
  import type { PickerText } from "../picker/text"
  import NewPlaylist from "../picker/NewPlaylist.svelte"
  import Glyph from "./Glyph.svelte"
  import PercentField from "./PercentField.svelte"

  export type AutoAddOptions = { readonly takes: AutoAddPlaylist["takes"]; readonly pct: number | null }

  // The auto-add list (UI-PICK-20), many mode over the shared picker model. Ticks go through the model; each
  // ticked playlist's options are the caller's, so the popup and settings write them the same way.
  let { picker, text, i18n, variant, options, filters, defaultPct, readOnly = false, ontakes, onpct, filter }: {
    picker: PickerModel
    text: PickerText
    i18n: I18n
    variant: "popup" | "settings"
    options: ReadonlyMap<PlaylistId, AutoAddOptions>
    filters: ReadonlyMap<PlaylistId, Snapshot<Filter>>
    defaultPct: number
    readOnly?: boolean
    ontakes: (id: PlaylistId, takes: AutoAddPlaylist["takes"]) => Promise<boolean>
    onpct: (id: PlaylistId, pct: number | null) => Promise<boolean>
    filter: Snippet<[PlaylistId, string]>
  } = $props()
  const uid = $props.id()
  let open = $state<PlaylistId | null>(null)
  let failed = $state<PlaylistId | null>(null)
  const percent = (value: number) => i18n.message("autoAddList_percent", { percent: i18n.number(value) })

  // Chosen playlists marked Missing or Full sit at the top (UI-PICK-20).
  const rows = $derived([...picker.rows].sort((a, b) => Number(b.check === "on" && b.mark !== null) - Number(a.check === "on" && a.mark !== null)))
  function pill(id: PlaylistId): string {
    const current = filters.get(id)
    const count = current?.channels.length ?? 0
    if (!current || count === 0 && !current.on) return i18n.message("autoAddList_pill_all")
    if (!current.on) return i18n.message("autoAddList_pill_kept", { count: i18n.number(count) })
    return i18n.message(current.mode === "allow" ? "autoAddList_pill_allow" : "autoAddList_pill_deny", { count: i18n.number(count) })
  }
  function summary(id: PlaylistId): string {
    const chosen = options.get(id)
    const parts = [
      chosen?.takes === "both" ? i18n.message("autoAddList_shortsToo") : chosen?.takes === "shorts" ? i18n.message("autoAddList_shortsOnly") : null,
      filters.get(id) ? pill(id) : null,
      chosen?.pct !== null && chosen?.pct !== undefined ? percent(chosen.pct) : null
    ]
    return parts.filter(Boolean).join(" · ")
  }
  async function toggle(row: PickerRow) {
    if (row.busy || readOnly) return
    if (row.check === "on") { await picker.untick(row.id); if (open === row.id) open = null }
    else await picker.tick(row.id)
  }
  async function edit(id: PlaylistId, work: () => Promise<boolean>) {
    failed = null
    if (!(await work())) failed = id
  }
</script>

<div class="flex flex-col gap-2">
  {#if picker.rows.length > 8}
    <label class="border-input bg-background focus-within:ring-ring/40 sticky top-0 z-10 flex min-h-8 items-center gap-2 rounded-lg border px-2.5 focus-within:ring-3">
      <span class="sr-only">{text.label("search")}</span>
      <input type="search" bind:value={picker.query} placeholder={text.label("search")} class="w-full bg-transparent text-sm outline-none" />
    </label>
  {/if}
  <ul class="flex flex-col" aria-label={text.label("listLabel")}>
    {#each rows as row (row.id)}
      {@const title = text.rowTitle(row)}
      {@const ticked = row.check === "on"}
      <li class="border-border/60 border-b last:border-b-0">
        <div class="flex min-h-11 items-center gap-2.5 py-1.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={row.check === "loading" ? "mixed" : ticked}
            aria-describedby="{uid}-{row.id}-line"
            disabled={readOnly || row.busy}
            data-autoadd-row={row.id}
            class="focus-visible:ring-ring/40 flex min-w-0 flex-1 items-center gap-2.5 rounded-md text-left outline-none focus-visible:ring-3 disabled:cursor-default"
            onclick={() => toggle(row)}
          >
            <span aria-hidden="true" class={clsx("inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
              ticked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background")}>
              {#if ticked}<Glyph name="check" class="size-3" strokeWidth={3} />{/if}
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{title}</span>
              <span id="{uid}-{row.id}-line" class="text-muted-foreground block truncate text-[12px]">
                {#if row.busy}{text.label("busy")}{:else if ticked && row.mark}{text.label(row.mark === "missing" ? "missing" : "full")}{:else if ticked}{summary(row.id)}{/if}
              </span>
            </span>
          </button>
          {#if ticked && !readOnly}
            {#if variant === "settings"}
              <button type="button" aria-expanded={open === row.id} aria-controls="{uid}-{row.id}-options" aria-label={i18n.message("autoAddList_options", { playlist: title })}
                class="bg-muted hover:bg-accent focus-visible:ring-ring/40 min-h-6 shrink-0 rounded-full px-2.5 text-[12px] font-medium outline-none focus-visible:ring-3"
                onclick={() => { open = open === row.id ? null : row.id }}>{pill(row.id)}</button>
            {:else}
              <button type="button" aria-expanded={open === row.id} aria-controls="{uid}-{row.id}-options" aria-label={i18n.message("autoAddList_options", { playlist: title })}
                class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/40 inline-flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3"
                onclick={() => { open = open === row.id ? null : row.id }}><Glyph name="settings" class="size-4" /></button>
            {/if}
          {/if}
        </div>
        {#if ticked && open === row.id}
          {@const chosen = options.get(row.id) ?? { takes: "videos", pct: null }}
          <div id="{uid}-{row.id}-options" class="bg-muted/50 mb-2 flex flex-col gap-3 rounded-lg p-3">
            <fieldset class="flex flex-col gap-1.5">
              <legend class="mb-1 text-[12.5px] font-medium">{i18n.message("autoAddList_takes")}</legend>
              <div class="bg-muted grid grid-cols-3 gap-0.5 rounded-lg p-0.5">
                {#each [["videos", "autoAddList_takes_videos"], ["shorts", "autoAddList_takes_shorts"], ["both", "autoAddList_takes_both"]] as const as [value, label] (value)}
                  <button type="button" role="radio" aria-checked={chosen.takes === value}
                    class={clsx("min-h-7 rounded-md text-[13px]", chosen.takes === value ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
                    onclick={() => { if (chosen.takes !== value) void edit(row.id, () => ontakes(row.id, value)) }}>{i18n.message(label)}</button>
                {/each}
              </div>
            </fieldset>
            <fieldset class="flex flex-col gap-1.5">
              <legend class="mb-1 text-[12.5px] font-medium">{i18n.message("autoAddList_addsAt")}</legend>
              <div class="flex flex-col gap-1 text-[13px]">
                <label class="flex items-center gap-2"><input type="radio" name="{uid}-{row.id}-pct" checked={chosen.pct === null}
                  onchange={() => edit(row.id, () => onpct(row.id, null))} />{i18n.message("autoAddList_default", { percent: i18n.number(defaultPct) })}</label>
                <label class="flex items-center gap-2"><input type="radio" name="{uid}-{row.id}-pct" checked={chosen.pct !== null}
                  onchange={() => edit(row.id, () => onpct(row.id, defaultPct))} />{i18n.message("autoAddList_own")}</label>
              </div>
              {#if chosen.pct !== null}
                <PercentField value={chosen.pct} label={i18n.message("autoAddList_percentLabel", { playlist: title })}
                  start={i18n.message("autoAdd_goal_start")} full={i18n.message("autoAdd_goal_full")}
                  onsave={next => edit(row.id, () => onpct(row.id, next))} />
              {/if}
            </fieldset>
            {@render filter(row.id, title)}
            {#if failed === row.id}<p role="status" class="text-destructive text-[12.5px]">{i18n.message("filter_failed")}</p>{/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  {#if !readOnly}
    <NewPlaylist {picker} {text} onpending={() => {}} onoutcome={() => {}} />
  {/if}
</div>
