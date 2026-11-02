<script lang="ts">
  import clsx from "clsx"
  import type { I18n } from "../../shared/i18n"
  import type { Filter } from "../../shared/model/types"
  import type { Snapshot } from "../../shared/model/settings-view"
  import Button from "./Button.svelte"
  import Glyph from "./Glyph.svelte"
  import Switch from "./Switch.svelte"

  export type FilterSetting = { readonly mode: Filter["mode"]; readonly on: boolean }
  export type ChannelAdd = { readonly kind: "added" } | { readonly kind: "error"; readonly message: string }

  // The channel filter editor (UI-PICK-21). Controlled: it shows the stored filter and asks for each change.
  // Channel list edits are optional, because they belong to the store's channel-edit operation.
  let { filter, playlist, i18n, current = null, readOnly = false, onsetting, onadd, onremove, onlistcurrent }: {
    filter: Snapshot<Filter> | null
    playlist: string
    i18n: I18n
    current?: { readonly title: string } | null
    readOnly?: boolean
    onsetting: (desired: FilterSetting, clearListed: boolean) => Promise<boolean>
    onadd?: (input: string) => Promise<ChannelAdd>
    onremove?: (channel: string) => Promise<boolean>
    onlistcurrent?: () => Promise<boolean>
  } = $props()
  const uid = $props.id()
  const mode = $derived(filter?.mode ?? "deny")
  const on = $derived(filter?.on ?? false)
  const channels = $derived(filter?.channels ?? [])
  let busy = $state(false)
  let failed = $state(false)
  let confirming = $state<Filter["mode"] | null>(null)
  let input = $state("")
  let addError = $state<string | null>(null)

  const count = (n: number) => String(n)
  const plural = (n: number) => i18n.plural(n)
  async function apply(desired: FilterSetting, clear: boolean) {
    busy = true; failed = false
    try { failed = !(await onsetting(desired, clear)) } catch { failed = true } finally { busy = false }
  }
  function pickMode(next: Filter["mode"]) {
    if (next === mode || busy) return
    if (channels.length > 0) { confirming = next; return }
    void apply({ mode: next, on }, false)
  }
  async function add() {
    if (!onadd || busy || !input.trim()) return
    busy = true; addError = null
    try {
      const answer = await onadd(input.trim())
      if (answer.kind === "added") input = ""
      else addError = answer.message
    } finally { busy = false }
  }
  async function run(work: () => Promise<boolean>) {
    busy = true; failed = false
    try { failed = !(await work()) } catch { failed = true } finally { busy = false }
  }
  const confirmText = $derived(confirming === null ? "" : i18n.message(
    confirming === "deny" ? (plural(channels.length) === "one" ? "channelFilter_toDeny_one" : "channelFilter_toDeny_other")
      : plural(channels.length) === "one" ? "channelFilter_toAllow_one" : "channelFilter_toAllow_other", { count: count(channels.length) }))
  const offLine = $derived(channels.length === 0 ? i18n.message("filter_offEmpty") : i18n.message(mode === "deny"
    ? plural(channels.length) === "one" ? "channelFilter_offKeptDenied_one" : "channelFilter_offKeptDenied_other"
    : plural(channels.length) === "one" ? "channelFilter_offKeptAllowed_one" : "channelFilter_offKeptAllowed_other", { count: count(channels.length) }))
</script>

<div class="flex flex-col gap-2.5 text-sm" aria-busy={busy || undefined}>
  <div class="flex items-center justify-between gap-3">
    <span id="{uid}-switch" class="font-medium">{i18n.message("filter_switch")}</span>
    <Switch checked={on} label={i18n.message("filter_switch")} disabled={readOnly || busy} onchange={next => apply({ mode, on: next }, false)} />
  </div>
  {#if on}
    <div role="radiogroup" aria-label={i18n.message("filter_mode")} class="bg-muted grid grid-cols-2 gap-0.5 rounded-lg p-0.5">
      {#each [["allow", "channelFilter_allowOnly"], ["deny", "channelFilter_deny"]] as const as [value, label] (value)}
        <button type="button" role="radio" aria-checked={mode === value} disabled={readOnly || busy}
          class={clsx("min-h-7 rounded-md px-2 text-[13px] font-medium", mode === value ? "bg-card shadow-sm" : "text-muted-foreground")}
          onclick={() => pickMode(value)}>{i18n.message(label)}</button>
      {/each}
    </div>
    <p class="text-muted-foreground text-[12.5px]">{i18n.message(mode === "allow" ? "channelFilter_hint_allow" : "channelFilter_hint_deny")}</p>
    {#if confirming}
      <div role="alertdialog" aria-labelledby="{uid}-confirm" class="border-warning-border bg-warning-soft rounded-lg border p-3">
        <p id="{uid}-confirm">{confirmText}</p>
        <div class="mt-2 flex gap-2">
          <Button size="sm" onclick={() => { const next = confirming; confirming = null; if (next) void apply({ mode: next, on }, true) }}>{i18n.message("filter_switchMode")}</Button>
          <Button size="sm" variant="outline" onclick={() => { confirming = null }}>{i18n.message("filter_cancel")}</Button>
        </div>
      </div>
    {/if}
    {#if mode === "allow" && channels.length === 0}
      <p class="text-warning text-[12.5px]">{i18n.message("channelFilter_emptyAllow", { playlist })}</p>
    {/if}
  {:else}
    <p class="text-muted-foreground text-[12.5px]">{offLine}</p>
  {/if}
  {#if channels.length > 0}
    <ul class="flex flex-wrap gap-1.5" aria-label={i18n.message("filter_switch")}>
      {#each channels as [id, title, handle] (id)}
        <li class="bg-muted inline-flex min-h-7 items-center gap-1 rounded-full pr-1 pl-2.5 text-[12.5px]">
          <span>{handle ? i18n.message("channelFilter_chip", { title, handle }) : title}</span>
          {#if onremove && !readOnly}
            <button type="button" aria-label={i18n.message("filter_removeChannel", { channel: title })} disabled={busy}
              class="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-full"
              onclick={() => run(() => onremove(id))}><Glyph name="x" class="size-3" /></button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if current && onlistcurrent && !readOnly}
    <Button size="sm" variant="outline" class="self-start" disabled={busy} onclick={() => run(onlistcurrent)}>
      {i18n.message(mode === "allow" ? "channelFilter_listCurrent_allow" : "channelFilter_listCurrent_deny", { channel: current.title })}
    </Button>
  {/if}
  {#if onadd && !readOnly}
    <form class="flex gap-2" onsubmit={event => { event.preventDefault(); void add() }}>
      <input bind:value={input} aria-label={i18n.message("filter_inputLabel")} placeholder={i18n.message("filter_inputLabel")}
        aria-invalid={addError !== null || undefined} aria-describedby={addError ? `${uid}-error` : undefined}
        class="border-input bg-background focus-visible:ring-ring/40 h-8 min-w-0 flex-1 rounded-md border px-2.5 outline-none focus-visible:ring-3" />
      <Button size="sm" variant="outline" pending={busy} disabled={!input.trim()} onclick={() => add()}>{i18n.message("filter_add")}</Button>
    </form>
    {#if addError}<p id="{uid}-error" role="status" class="text-destructive text-[12.5px]">{addError}</p>{/if}
  {/if}
  {#if failed}<p role="status" class="text-destructive text-[12.5px]">{i18n.message("filter_failed")}</p>{/if}
</div>
