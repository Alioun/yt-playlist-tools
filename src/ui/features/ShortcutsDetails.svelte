<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Glyph from "../components/Glyph.svelte"
  import KeyRecorder from "../keys/KeyRecorder.svelte"
  import { createKeySettingsClient } from "../keys/client"
  import { keyRecorderText } from "../keys/text"
  import type { KeyRecorderController } from "../keys/controller"
  import type { ShortcutId } from "../../shared/model/validation"
  import type { PageState } from "../lib/page-state.svelte"
  import DestinationChooser from "./DestinationChooser.svelte"

  // Playlist shortcuts' list (UI-POP-24, UI-SET-10): each key, its name and this account's playlist, Add shortcut,
  // and a removed shortcut's 6 s Undo row in its place.
  let { pageState, variant }: { pageState: PageState; variant: "popup" | "settings" } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const text = keyRecorderText(i18n)
  const client = createKeySettingsClient({ backend, platform, commands: untrack(() => pageState.page.commands), text,
    chooser: { open: async () => {} } })
  const controllers = new Map<ShortcutId, KeyRecorderController>()
  let removed = $state<{ readonly id: ShortcutId; readonly receipt: string; readonly label: string } | null>(null)
  let failed = $state(false)
  let undoTimer: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => { clearTimeout(undoTimer); client.dispose() })
  const list = $derived(pageState.settings?.shortcuts.list ?? [])
  const browser = platform.browser === "firefox" ? "Firefox" : "Chrome"
  function controller(id: ShortcutId): KeyRecorderController {
    let existing = controllers.get(id)
    if (!existing) { existing = client.recorder({ kind: "playlist", id }); controllers.set(id, existing) }
    return existing
  }
  async function add() {
    failed = false
    await client.ready
    const answer = await client.add()
    if (answer.kind === "recording") controllers.set(answer.id, answer.controller)
    else failed = true
  }
  async function remove(id: ShortcutId, label: string) {
    failed = false
    await client.ready
    const answer = await client.remove(id)
    if (answer.kind !== "removed") { failed = true; return }
    controllers.delete(id)
    removed = { id, receipt: answer.receipt, label }
    clearTimeout(undoTimer)
    undoTimer = setTimeout(() => { removed = null }, answer.undoForMs)
  }
  async function undo() {
    if (!removed) return
    const answer = await client.undo(removed.receipt)
    removed = null
    failed = answer.kind === "refused"
  }
  async function rename(id: ShortcutId, value: string, current: string) {
    if (value.trim() === current) return
    await client.ready
    failed = (await client.label(id, value)).kind === "refused"
  }
</script>

<div class="flex flex-col gap-2 text-[13px]">
  {#if variant === "settings"}<p class="text-muted-foreground text-[12px]">{i18n.message("shortcuts_count", { count: i18n.number(list.length) })}</p>{/if}
  <ul class="flex flex-col gap-2">
    {#each list as row (row.id)}
      {@const name = row.label || i18n.message("shortcuts_shortcut")}
      <li class="flex flex-wrap items-center gap-2" data-shortcut={row.id}>
        {#await client.ready then}
          <KeyRecorder controller={controller(row.id as ShortcutId)} {text} title={name} showTitle={false} targetName={() => name} os={platform.os} {browser} />
        {/await}
        <input class="border-input bg-background h-7 min-w-0 flex-1 rounded-md border px-2" aria-label={i18n.message("shortcuts_label")} value={row.label}
          disabled={!pageState.editable} onchange={event => rename(row.id as ShortcutId, event.currentTarget.value, row.label)} />
        <DestinationChooser {pageState} destination={{ kind: "shortcut", shortcut: row.id as ShortcutId }} label={i18n.message("shortcuts_savesTo", { account: pageState.accountName() })}
          purpose={{ kind: "named", title: i18n.message("picker_shortcutTitle"), subtitle: null }} everyAccount={row.watchLaterOnEveryAccount} />
        <Button variant="ghost" size="sm" aria-label={i18n.message("shortcuts_remove")} disabled={!pageState.editable} onclick={() => remove(row.id as ShortcutId, name)}><Glyph name="trash" /></Button>
      </li>
    {/each}
    {#if removed}
      <li class="bg-muted flex items-center gap-2 rounded-md px-2 py-1" role="status">
        <span class="flex-1">{i18n.message("shortcuts_removed")}</span>
        <Button size="sm" variant="link" onclick={undo}>{i18n.message("shortcuts_undo")}</Button>
      </li>
    {/if}
  </ul>
  {#if list.length < 20}
    <Button size="sm" variant="outline" class="self-start" disabled={!pageState.editable} onclick={add}><Glyph name="plus" />{i18n.message("shortcuts_add")}</Button>
  {:else}
    <p class="text-muted-foreground text-[12px]">{i18n.message("shortcuts_limit")}</p>
  {/if}
  {#if failed}<p role="status" class="text-destructive text-[12px]">{i18n.message("shortcuts_failed")}</p>{/if}
</div>
