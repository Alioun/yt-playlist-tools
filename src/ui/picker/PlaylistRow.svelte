<script lang="ts">
  import { Checkbox } from "bits-ui"
  import { display } from "../../shared/keys"
  import type { Platform } from "../../shared/keys"
  import type { PickerModel, PickerRow } from "../../shared/picker/model.svelte"
  import type { PickerText } from "./text"
  import Glyph from "../components/Glyph.svelte"
  import PickerIcon from "./PickerIcon.svelte"

  let {
    picker, row, check, text, platform, everyAccount, result, onactivate, onpin, onremove, onundo
  }: {
    picker: PickerModel
    row: PickerRow
    check: PickerRow["check"]
    text: PickerText
    platform: Platform["os"]
    everyAccount: boolean
    result: string | null
    onactivate: () => void
    onpin: () => void
    onremove: () => void
    onundo: () => void
  } = $props()

  const uid = $props.id()
  const title = $derived(text.rowTitle(row, everyAccount))
  const key = $derived(row.key === null ? null : display(row.key, platform))
  const saved = $derived(!row.busy && !result && row.status.kind === "unchosen" ? text.pickSaved(row.status.save, picker.site, title) : null)
  const status = $derived.by(() => {
    if (row.busy) return text.label("busy")
    if (result) return result
    switch (row.status.kind) {
      case "unchosen": return row.status.undo === "failed" ? text.label("undoFailed") : text.refusal[row.status.reason]
      case "already-in": return text.label("alreadyIn")
      case "save-failed": return text.label("couldNotSave")
      case "remove-failed": return text.label("couldNotRemove")
      case "removed": return text.label("removed")
      case "refused": return text.refusal[row.status.reason]
      default: return null
    }
  })

  function keydown(event: KeyboardEvent) {
    if ((event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) && (event.key === " " || event.key === "Enter")) {
      event.preventDefault()
      return
    }
    if (event.repeat && (event.key === " " || event.key === "Enter")) {
      event.preventDefault()
      return
    }
    if (event.key === "Enter" && !event.isComposing && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      event.preventDefault()
      if (!row.busy && !picker.closed) onactivate()
    }
  }
</script>

<li class="playlist-row" data-mode={picker.mode} data-busy={row.busy} data-check={check}>
  <Checkbox.Root
    bind:checked={() => check === "on", () => { if (!row.busy && !picker.closed) onactivate() }}
    readonly={row.busy || picker.closed}
    aria-disabled={row.busy || picker.closed || undefined}
    aria-busy={row.busy || check === "loading" || undefined}
    aria-labelledby="{uid}-title"
    aria-describedby="{uid}-details {uid}-status"
    class="row-choice"
    data-picker-row={row.id}
    onkeydown={keydown}
  >
    <span class="thumbnail" aria-hidden="true">
      {#if row.thumb}<img src={row.thumb} alt="" loading="lazy" referrerpolicy="no-referrer" />{:else}<PickerIcon name="playlist" />{/if}
    </span>
    <span class="row-copy">
      <span id="{uid}-title" class="row-title">{title}</span>
      <span id="{uid}-details" class="row-details">
        {#if row.privacy !== null && row.listed === "listed"}
          <PickerIcon name={row.privacy === "PRIVATE" ? "lock" : row.privacy === "UNLISTED" ? "link" : "globe"} />
        {/if}
        <span>{text.rowDetails(row, picker.site)}</span>
      </span>
      <span id="{uid}-status" class="row-status" class:empty={status === null} aria-live="polite">{#if saved}<span class="row-saved">{saved}</span>{/if}<span>{status ?? ""}</span></span>
    </span>
    {#if key}<kbd aria-label={text.shortcutLabel(key)}>{key}</kbd>{/if}
    <span aria-hidden="true" class="check" class:checking={check === "loading"}>
      {#if row.busy}<Glyph name="loader" class="motion-safe:animate-spin" />{:else if check === "on"}<Glyph name="check" />{/if}
    </span>
  </Checkbox.Root>
  <span class="row-actions">
    {#if row.status.kind === "unchosen" && !row.busy && !picker.closed}
      {#if row.status.undo === "offered"}<button type="button" class="row-action" onclick={onundo}>{text.label("undo")}</button>{/if}
      <button type="button" class="row-action" onclick={onactivate}>{text.label("tryAgain")}</button>
    {/if}
    {#if row.mark !== null && picker.mode !== "save"}
      <span class="mark">{row.mark === "missing" ? text.label("missing") : text.label("full")}</span>
      <button type="button" class="remove-choice" aria-label={text.removeName(title)} aria-disabled={row.busy || undefined} onclick={() => { if (!row.busy) onremove() }}>{text.label("remove")}</button>
    {/if}
    {#if picker.pins !== "none"}
      <button
        type="button" class="pin" class:pinned={row.pinned}
        disabled={picker.pins === "private" || picker.closed}
        aria-disabled={row.busy || undefined}
        aria-pressed={row.pinned}
        aria-label={text.pinName(title, row.pinned)}
        aria-describedby={picker.pins === "private" ? `${uid}-private` : undefined}
        title={picker.pins === "private" ? text.label("privatePin") : text.label(row.pinned ? "pinned" : "pin")}
        onclick={() => { if (!row.busy) onpin() }}
      ><PickerIcon name="pin" /></button>
      {#if picker.pins === "private"}<span class="sr-only" id="{uid}-private">{text.label("privatePin")}</span>{/if}
    {/if}
  </span>
</li>

<style>
  .playlist-row { display: flex; align-items: center; gap: .25rem; padding: .2rem .5rem; border-radius: .625rem; }
  .playlist-row:hover, .playlist-row:focus-within { background: var(--muted); }
  :global(.row-choice) { display: flex; align-items: center; gap: .75rem; min-width: 0; flex: 1; padding: .5rem .25rem; border: 0; background: transparent; color: inherit; text-align: start; cursor: pointer; border-radius: .5rem; }
  :global(.row-choice[aria-disabled="true"]) { cursor: progress; }
  .thumbnail { width: 4rem; aspect-ratio: 16 / 9; flex-shrink: 0; display: grid; place-items: center; overflow: hidden; border-radius: .35rem; background: var(--secondary); color: var(--muted-foreground); }
  .thumbnail img { width: 100%; height: 100%; object-fit: cover; }
  .row-copy { min-width: 0; flex: 1; }
  .row-title { display: block; font-size: .875rem; font-weight: 550; line-height: 1.35; overflow-wrap: anywhere; }
  .row-details { display: flex; align-items: center; gap: .25rem; margin-top: .2rem; color: var(--muted-foreground); font-size: .75rem; line-height: 1.4; }
  .row-details :global(svg) { width: .8rem; height: .8rem; flex-shrink: 0; }
  .row-status { display: block; color: var(--destructive); font-size: .75rem; line-height: 1.4; }
  .row-status.empty { display: none; }
  .row-saved { display: block; color: var(--muted-foreground); }
  [data-busy="true"] .row-status { color: var(--muted-foreground); }
  kbd { color: var(--muted-foreground); background: var(--card); border: 1px solid var(--border); border-radius: .3rem; padding: .15rem .3rem; font: inherit; font-size: .68rem; white-space: nowrap; }
  .check { display: grid; place-items: center; width: 1.15rem; height: 1.15rem; flex-shrink: 0; border: 1.5px solid var(--input); border-radius: .3rem; }
  .check :global(svg) { width: .85rem; height: .85rem; }
  [data-check="on"] .check { border-color: var(--primary); background: var(--primary); color: var(--primary-foreground); }
  [data-mode="save"][data-check="on"] .check { border-color: var(--success); background: var(--success); color: var(--card); }
  .checking { background: var(--input); animation: checking 1.2s ease-in-out infinite; }
  .row-actions { display: flex; align-items: center; flex-wrap: wrap; justify-content: end; gap: .25rem; max-width: 6rem; }
  .pin { display: grid; place-items: center; width: 2rem; height: 2rem; color: var(--muted-foreground); border: 0; border-radius: .5rem; background: transparent; opacity: 0; cursor: pointer; }
  .pin.pinned, .playlist-row:hover .pin, .playlist-row:focus-within .pin { opacity: 1; }
  .pin.pinned { color: var(--primary); }
  .pin.pinned :global(svg) { fill: color-mix(in oklch, var(--primary) 22%, transparent); }
  .pin:disabled { cursor: not-allowed; opacity: .45; }
  .pin:hover:not(:disabled), .remove-choice:hover { background: var(--accent); }
  .mark { color: var(--warning); font-size: .72rem; font-weight: 600; }
  .row-action { background: transparent; border: 0; padding: .25rem; color: var(--primary); border-radius: .25rem; font-size: .72rem; font-weight: 600; cursor: pointer; }
  .row-action:hover { background: var(--accent); }
  .remove-choice { background: transparent; border: 0; padding: .25rem; color: var(--primary); border-radius: .25rem; font-size: .72rem; cursor: pointer; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @keyframes checking { 50% { opacity: .4; } }
  @media (prefers-reduced-motion: reduce) { .checking { animation: none; } }
  @media (hover: none) { .pin { opacity: 1; } }
  @media (max-width: 380px) { .thumbnail { width: 2.75rem; } kbd { display: none; } :global(.row-choice) { gap: .4rem; } }
</style>
