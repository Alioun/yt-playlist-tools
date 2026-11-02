<script lang="ts">
  import { pickerSource } from "./source"
  import { onDestroy, untrack } from "svelte"
  import AutoAddList, { type AutoAddOptions } from "../components/AutoAddList.svelte"
  import ChannelFilterEditor from "../components/ChannelFilterEditor.svelte"
  import { createPickerText } from "../picker"
  import { PickerModel } from "../../shared/picker/model.svelte"
  import { isPlaylistId, type AccountKey, type PlaylistId } from "../../shared/model/validation"
  import { createAutoAddEditor } from "../backend/page-source"
  import type { PageState } from "../lib/page-state.svelte"

  // This account's auto-add list (UI-POP-23, UI-SET-10). The parent keys it by account, so one model serves one account.
  let { pageState, acct, variant }: { pageState: PageState; acct: AccountKey; variant: "popup" | "settings" } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  const text = createPickerText(i18n)
  const source = untrack(() => pickerSource(pageState, acct, "www", { kind: "auto-add" }))
  const picker = new PickerModel({ source, site: "www", mode: "many" })
  const editor = createAutoAddEditor(backend, untrack(() => acct))
  onDestroy(() => { picker.close(); source.dispose() })
  const entry = $derived(pageState.ready?.setups.find(row => row.acct === acct))
  const options = $derived(new Map<PlaylistId, AutoAddOptions>((entry?.setup.autoAdd ?? []).flatMap(row =>
    isPlaylistId(row.pl) ? [[row.pl, { takes: row.takes, pct: row.pct ?? null }] as const] : [])))
  const syncOnly = $derived(entry !== undefined && entry.cache === null && !pageState.tab)

  async function setting(playlist: PlaylistId, desired: { mode: "allow" | "deny"; on: boolean }, clearListed: boolean) {
    const answer = await backend.call("ui.filter", { change: { acct, playlist, desired, clearListed, expectedGeneration: entry?.filterGens.get(playlist) ?? null } })
    return answer.kind === "answered" && answer.result.kind === "confirmed"
  }
</script>

{#if !pageState.agreed}
  <p class="text-muted-foreground text-[12.5px]">{i18n.message("autoAddList_consent")}</p>
{:else if syncOnly}
  {@const count = entry?.setup.autoAdd.length ?? 0}
  <p class="text-muted-foreground text-[12.5px]">{i18n.message(i18n.plural(count) === "one" ? "autoAddList_syncOnly_one" : "autoAddList_syncOnly_other",
    { count: i18n.number(count), account: pageState.accountName(acct) })}</p>
{:else}
  {#if !entry}<p class="text-muted-foreground mb-1 text-[12.5px]">{i18n.message("autoAddList_nothingSaved", { account: pageState.accountName(acct) })}</p>{/if}
  {#if pageState.private}<p class="text-muted-foreground mb-1 text-[12.5px]">{i18n.message("autoAddList_readOnly")}</p>{/if}
  <AutoAddList {picker} {text} {i18n} {variant} {options} filters={entry?.filters ?? new Map()} defaultPct={pageState.settings?.autoAdd.pct ?? 50}
    readOnly={pageState.private} ontakes={editor.takes} onpct={editor.pct}>
    {#snippet filter(playlist, title)}
      <ChannelFilterEditor filter={entry?.filters.get(playlist) ?? null} playlist={title} {i18n} readOnly={pageState.private}
        onsetting={(desired, clear) => setting(playlist, desired, clear)} />
    {/snippet}
  </AutoAddList>
{/if}
