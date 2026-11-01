<script lang="ts">
  import { onDestroy, onMount, tick } from "svelte"
  import { on } from "svelte/events"
  import type { PickerRow, SettingOutcome } from "../../shared/picker/model.svelte"
  import type { PlaylistId } from "../../shared/model"
  import type { PickerPanelProps, PickerEvent } from "./types"
  import Button from "../components/Button.svelte"
  import Glyph from "../components/Glyph.svelte"
  import Switch from "../components/Switch.svelte"
  import PlaylistRow from "./PlaylistRow.svelte"
  import NewPlaylist from "./NewPlaylist.svelte"
  import PickerIcon from "./PickerIcon.svelte"

  let { picker, text, purpose, platform, watchLaterEveryAccount = false, onoutcome, onpending, onrequestclose, onhelp }: PickerPanelProps = $props()
  const uid = $props.id()
  let root: HTMLElement | undefined = $state()
  let search: HTMLInputElement | undefined = $state()
  let heldChecks = $state.raw<ReadonlyMap<PlaylistId, PickerRow["check"]>>(new Map())
  let results = $state.raw<ReadonlyMap<PlaylistId, string>>(new Map())
  let refreshFailed = $state(false)
  let sortPending = $state(false)
  let sortBefore = $state(false)
  let sortOutcome: SettingOutcome | null = $state.raw(null)
  let focusedRow: string | null = $state(null)
  let mounted = true
  const heading = $derived(text.heading(purpose, picker.site))
  const membershipText = $derived.by(() => {
    if (!picker.list.refreshable) return picker.list.at === null ? text.label("noSavedList") : text.savedList(picker.list.at)
    switch (picker.membership.kind) {
      case "checking": return text.checking(picker.site)
      case "unreadable": return text.unreadable(picker.site)
      case "known": return heldChecks.size > 0 ? text.label("busy") : text.known(picker.membership.count)
      case "none": return null
    }
  })

  onMount(() => { search?.focus({ preventScroll: true }) })
  onDestroy(() => { mounted = false })

  $effect(() => {
    const ids = picker.rows.map(row => row.id)
    if (focusedRow === null) return
    const index = ids.findIndex(id => id === focusedRow)
    if (index < 0) focusedRow = null
    void tick().then(() => {
      if (mounted && (!document.activeElement || document.activeElement === document.body)) focusRow(index < 0 ? 0 : index)
    })
  })

  function emit(event: PickerEvent) { if (mounted) onoutcome(event) }
  function observe(event: Promise<PickerEvent>) { onpending?.(event) }
  function hold(row: PickerRow) {
    heldChecks = new Map(heldChecks).set(row.id, row.check)
    const next = new Map(results)
    next.delete(row.id)
    results = next
  }
  function release(id: PlaylistId) {
    const next = new Map(heldChecks)
    next.delete(id)
    heldChecks = next
  }
  async function activate(row: PickerRow) {
    if (row.busy || picker.closed || heldChecks.has(row.id)) return
    hold(row)
    const removing = picker.mode !== "choose" && row.check === "on"
    if (removing) {
      const answer = picker.untick(row.id)
      observe(answer.then(outcome => ({ kind: "untick", id: row.id, outcome })))
      const outcome = await answer
      if (!mounted) return
      release(row.id)
      if (outcome.kind === "unavailable" && outcome.reason !== "mode") results = new Map(results).set(row.id, text.unavailable[outcome.reason])
      emit({ kind: "untick", id: row.id, outcome })
    } else {
      const answer = picker.tick(row.id)
      observe(answer.then(outcome => ({ kind: "tick", id: row.id, outcome })))
      const outcome = await answer
      if (!mounted) return
      release(row.id)
      if (outcome.kind === "picked") {
        if ("refused" in outcome.choice) results = new Map(results).set(row.id, text.refusal[outcome.choice.refused])
      }
      if (outcome.kind === "unavailable" && outcome.reason !== "mode") results = new Map(results).set(row.id, text.unavailable[outcome.reason])
      emit({ kind: "tick", id: row.id, outcome })
    }
  }
  async function removeChoice(row: PickerRow) {
    if (row.busy || picker.closed || heldChecks.has(row.id)) return
    hold(row)
    const answer = picker.untick(row.id)
    observe(answer.then(outcome => ({ kind: "untick", id: row.id, outcome })))
    const outcome = await answer
    if (!mounted) return
    release(row.id)
    if (outcome.kind === "unavailable" && outcome.reason !== "mode") results = new Map(results).set(row.id, text.unavailable[outcome.reason])
    emit({ kind: "untick", id: row.id, outcome })
  }
  async function pin(row: PickerRow) {
    if (row.busy || picker.closed) return
    const answer = picker.pin(row.id)
    observe(answer.then(outcome => ({ kind: "pin", id: row.id, outcome })))
    const outcome = await answer
    emit({ kind: "pin", id: row.id, outcome })
  }
  async function refresh() {
    if (picker.list.refreshing || !picker.list.refreshable || picker.closed) return
    refreshFailed = false
    const answer = picker.refresh()
    observe(answer.then(outcome => ({ kind: "refresh", outcome })))
    const outcome = await answer
    if (!mounted) return
    refreshFailed = outcome.kind === "failed"
    emit({ kind: "refresh", outcome })
  }
  async function sort(next: boolean) {
    if (sortPending || picker.closed) return
    sortBefore = picker.sortAZ
    sortPending = true
    sortOutcome = null
    const answer = picker.setSortAZ(next)
    observe(answer.then(outcome => ({ kind: "sort", outcome })))
    const outcome = await answer
    if (!mounted) return
    sortPending = false
    sortOutcome = outcome
    emit({ kind: "sort", outcome })
  }
  function rowControls(): HTMLButtonElement[] {
    return [...(root?.querySelectorAll<HTMLButtonElement>("button[data-picker-row]") ?? [])]
  }
  function focusRow(index: number) {
    const rows = rowControls()
    const row = rows[Math.min(Math.max(0, index), rows.length - 1)]
    if (row) { row.focus({ preventScroll: true }); row.scrollIntoView?.({ block: "nearest" }) }
    else search?.focus({ preventScroll: true })
  }
  function keydown(event: KeyboardEvent) {
      event.stopPropagation()
      if (event.isComposing) return
      if (event.key === "Escape") {
        event.preventDefault()
        onrequestclose({ reason: "escape" })
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (event.target === search) {
        if (event.key === "ArrowDown") { event.preventDefault(); focusRow(0) }
        else if (event.key === "Enter") {
          event.preventDefault()
          const first = picker.rows[0]
          if (!event.repeat && first) void activate(first)
        }
        return
      }
      const rows = rowControls()
      const index = rows.findIndex(row => row === event.target)
      if (index < 0) return
      if (event.key === "ArrowDown") { event.preventDefault(); focusRow(index + 1) }
      else if (event.key === "ArrowUp") { event.preventDefault(); focusRow(index - 1) }
      else if (event.key === "Home") { event.preventDefault(); focusRow(0) }
      else if (event.key === "End") { event.preventDefault(); focusRow(rows.length - 1) }
  }
  function keyboard(node: HTMLElement) {
    const offKeydown = on(node, "keydown", keydown)
    function keyup(event: KeyboardEvent) { event.stopPropagation() }
    function focusin(event: FocusEvent) {
      focusedRow = event.target instanceof HTMLElement ? event.target.getAttribute("data-picker-row") : null
    }
    node.addEventListener("keyup", keyup)
    node.addEventListener("focusin", focusin)
    return { destroy() { offKeydown(); node.removeEventListener("keyup", keyup); node.removeEventListener("focusin", focusin) } }
  }
</script>

<section bind:this={root} use:keyboard class="picker-panel" aria-labelledby="{uid}-heading" data-picker-mode={picker.mode}>
  <header class="picker-header">
    <div class="heading-row">
      <h2 id="{uid}-heading">{heading.title}</h2>
      <Button variant="ghost" size="sm" onclick={() => onrequestclose({ reason: "button" })} aria-label={text.label("close")}><PickerIcon name="close" /></Button>
    </div>
    {#if heading.subtitle}<p class="subtitle">{heading.subtitle}</p>{/if}
    <div class="toolbar">
      <Button variant="ghost" size="sm" pending={picker.list.refreshing} disabled={!picker.list.refreshable || picker.closed} onclick={refresh} aria-label={text.label("refresh")} aria-describedby={!picker.list.refreshable ? `${uid}-no-tab` : undefined}><Glyph name="refresh" /></Button>
      <span id="{uid}-sort-label">{text.label("sort")}</span>
      <Switch checked={sortPending ? sortBefore : picker.sortAZ} onchange={sort} label={text.label("sort")} describedby="{uid}-sort-status" disabled={picker.closed} />
    </div>
    <p id="{uid}-sort-status" class="status" class:empty={!sortPending && sortOutcome?.kind !== "refused"} aria-live="polite">{sortPending ? text.label("sortPending") : sortOutcome?.kind === "refused" ? text.label("sortRefused") : ""}</p>
    <label class="search"><PickerIcon name="search" /><input bind:this={search} data-picker-search aria-label={text.label("search")} placeholder={text.label("search")} type="search" bind:value={picker.query} /></label>
    {#if membershipText}<p class="status" aria-live="polite">{membershipText}</p>{/if}
    {#if !picker.list.refreshable}<p id="{uid}-no-tab" class="status">{text.label("noTab")}</p>{/if}
    {#if refreshFailed}<p class="error" role="status">{text.label("refreshFailed")}</p>{/if}
  </header>
  <div class="rows">
    {#if picker.rows.length === 0}
      <p class="empty" role="status">{picker.query.trim() ? text.label("emptySearch") : picker.list.refreshing ? text.label("loadingList") : picker.list.at === null ? text.label("listUnavailable") : text.label("emptyList")}</p>
    {/if}
    <ul aria-label={text.label("listLabel")}>
      {#each picker.rows as row (row.id)}
        <PlaylistRow {picker} {row} {text} {platform} everyAccount={watchLaterEveryAccount} check={heldChecks.get(row.id) ?? row.check} result={results.get(row.id) ?? null} onactivate={() => activate(row)} onpin={() => pin(row)} onremove={() => removeChoice(row)} />
      {/each}
    </ul>
  </div>
  <NewPlaylist {picker} {text} {onhelp} onpending={answer => observe(answer.then(outcome => ({ kind: "create", outcome })))} onoutcome={outcome => emit({ kind: "create", outcome })} />
</section>

<style>
  .picker-panel { display: flex; flex-direction: column; width: 100%; min-width: 0; max-height: inherit; overflow: hidden; color: var(--foreground); background: var(--card); font-family: var(--font-sans); }
  .picker-header { padding: 1rem 1rem .65rem; flex-shrink: 0; }
  .heading-row { display: flex; justify-content: space-between; align-items: start; gap: .5rem; }
  h2 { margin: .15rem 0 0; font-size: 1rem; font-weight: 650; line-height: 1.4; overflow-wrap: anywhere; }
  .subtitle { margin: .3rem 0 .5rem; color: var(--muted-foreground); font-size: .8rem; line-height: 1.5; }
  .toolbar { display: flex; align-items: center; justify-content: end; gap: .5rem; margin: .5rem 0; font-size: .75rem; color: var(--muted-foreground); }
  .search { display: flex; align-items: center; gap: .5rem; min-height: 2.25rem; border: 1px solid var(--input); border-radius: .6rem; padding: .4rem .65rem; color: var(--muted-foreground); background: var(--background); }
  .search:focus-within { outline: 2px solid var(--ring); outline-offset: 2px; }
  input { width: 100%; min-width: 0; padding: 0; border: 0; background: transparent; color: var(--foreground); font: inherit; font-size: .875rem; outline: none; }
  input::placeholder { color: var(--muted-foreground); }
  .status, .error { margin: .45rem 0 0; font-size: .75rem; line-height: 1.5; overflow-wrap: anywhere; }
  .status { color: var(--muted-foreground); }
  .status.empty { display: none; }
  .error { color: var(--destructive); }
  .rows { overflow-y: auto; overscroll-behavior: contain; min-height: 0; padding: 0 .4rem .5rem; flex: 1; }
  ul { list-style: none; margin: 0; padding: 0; }
  .empty { margin: .75rem .6rem 1rem; color: var(--muted-foreground); font-size: .875rem; line-height: 1.5; }
</style>
