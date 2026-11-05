<script lang="ts">
  import type { SimpleMessageKey } from "../../shared/i18n"
  import clsx from "clsx"
  import { untrack } from "svelte"
  import Switch from "../components/Switch.svelte"
  import type { SharedSettingChange } from "../../shared/contracts/shared-settings"
  import type { GatherOrder } from "../../shared/model/types"
  import type { PageState } from "../lib/page-state.svelte"
  import DestinationChooser from "./DestinationChooser.svelte"

  // Gather tabs' options, the same in the popup's unfolded row and the Settings card (UI-POP-36, UI-SET-24).
  let { pageState }: { pageState: PageState } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  const gather = $derived(pageState.settings?.gather)
  const hasPlaylist = $derived(pageState.setup?.setup.gather != null)
  let failed = $state(false)
  const orders: readonly [GatherOrder, SimpleMessageKey][] = [
    ["newest", "gatherOpt_order_newest"], ["oldest", "gatherOpt_order_oldest"], ["english", "gatherOpt_order_english"],
    ["non-english", "gatherOpt_order_nonEnglish"], ["left-to-right", "gatherOpt_order_leftToRight"], ["right-to-left", "gatherOpt_order_rightToLeft"], ["shuffled", "gatherOpt_order_shuffled"]]
  async function save(change: SharedSettingChange) {
    failed = false
    const answer = await backend.change(change)
    failed = answer.kind !== "confirmed"
  }
  type AutoField = "gather.auto.unvisited" | "gather.auto.background" | "gather.auto.count"
  // Ticking an automatic option with no gather playlist opens the chooser first, and the pick then ticks it (YT-GT-16).
  let waiting = $state<AutoField | null>(null)
  function auto(field: AutoField, event: Event & { currentTarget: HTMLInputElement }) {
    if (hasPlaylist || !event.currentTarget.checked) { void save({ kind: "option", field, value: event.currentTarget.checked }); return }
    event.currentTarget.checked = false
    waiting = field
  }
  function chosen() {
    const field = waiting
    waiting = null
    if (field) void save({ kind: "option", field, value: true })
  }
  const uid = $props.id()
  const playlistTitle = $derived(pageState.title(pageState.setup?.setup.gather as never ?? null))
</script>

{#if gather}
  <div class="flex flex-col gap-3 text-[13px]">
    <fieldset class="flex flex-col gap-1.5">
      <legend class="mb-1 font-medium">{i18n.message("gatherOpt_into")}</legend>
      {#each [["player", "gatherOpt_player", "gatherOpt_playerLine"], ["queue", "gatherOpt_queue", "gatherOpt_queueLine"], ["playlist", "gather_into_playlist", null]] as const as [to, label, line] (to)}
        <label class="flex items-start gap-2">
          <input type="radio" name="{uid}-to" class="mt-1" checked={gather.to === to} onchange={() => save({ kind: "option", field: "gather.to", value: to })} />
          <span>{i18n.message(label)}{#if line}<span class="text-muted-foreground block text-[12px]">{i18n.message(line)}</span>{/if}</span>
        </label>
      {/each}
      {#if gather.to === "playlist"}
        <div class="pl-6"><DestinationChooser {pageState} destination={{ kind: "gather" }} label={i18n.message("gatherOpt_playlistLabel")}
          purpose={{ kind: "gather", accountName: pageState.accountName() }} /></div>
      {/if}
    </fieldset>
    <label class="flex flex-col gap-1">
      <span class="font-medium">{i18n.message("gatherOpt_order")}</span>
      <select class="border-input bg-background h-8 rounded-md border px-2" value={gather.order}
        onchange={event => save({ kind: "option", field: "gather.order", value: event.currentTarget.value as GatherOrder })}>
        {#each orders as [value, label] (value)}<option {value}>{i18n.message(label)}</option>{/each}
      </select>
      {#if gather.order === "english" || gather.order === "non-english"}<span class="text-muted-foreground text-[12px]">{i18n.message("gatherOpt_languageLine")}</span>{/if}
    </label>
    <div class="flex items-start justify-between gap-3">
      <span>{i18n.message("gatherOpt_close")}<span class="text-muted-foreground block text-[12px]">{i18n.message("gatherOpt_closeLine")}</span></span>
      <Switch checked={gather.close} label={i18n.message("gatherOpt_close")} onchange={value => save({ kind: "option", field: "gather.close", value })} />
    </div>
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 font-medium">{playlistTitle ? i18n.message("gatherOpt_auto", { playlist: playlistTitle }) : i18n.message("gatherOpt_autoNoPlaylist")}</legend>
      {#if waiting && !hasPlaylist}
        <p class="text-[12px]" role="status">{i18n.message("gather_noPlaylist", { account: pageState.accountName() })}</p>
        <DestinationChooser {pageState} destination={{ kind: "gather" }} label={i18n.message("gatherOpt_playlistLabel")} opened
          purpose={{ kind: "gather", accountName: pageState.accountName() }} onchosen={chosen} />
      {:else if !hasPlaylist}<p id="{uid}-needs" class="text-muted-foreground text-[12px]">{i18n.message("gatherOpt_needsPlaylist")}</p>{/if}
      <label class={clsx("flex items-start gap-2", !hasPlaylist && "opacity-60")}>
        <input type="checkbox" class="mt-1" aria-describedby={hasPlaylist ? undefined : `${uid}-needs`} checked={gather.auto.unvisited} onchange={event => auto("gather.auto.unvisited", event)} />
        <span>{i18n.message("gatherOpt_unvisited")}
          <select class="border-input bg-background ml-1 h-7 rounded border px-1" disabled={!hasPlaylist} value={gather.auto.after}
            onchange={event => save({ kind: "option", field: "gather.auto.after", value: event.currentTarget.value as "1h" | "1d" | "1w" })}>
            <option value="1h">{i18n.message("gatherOpt_after_1h")}</option><option value="1d">{i18n.message("gatherOpt_after_1d")}</option><option value="1w">{i18n.message("gatherOpt_after_1w")}</option>
          </select>
          <span class="text-muted-foreground block text-[12px]">{i18n.message("gatherOpt_unvisitedLine")}</span></span>
      </label>
      <label class={clsx("flex items-start gap-2", !hasPlaylist && "opacity-60")}>
        <input type="checkbox" class="mt-1" aria-describedby={hasPlaylist ? undefined : `${uid}-needs`} checked={gather.auto.background} onchange={event => auto("gather.auto.background", event)} />
        <span>{i18n.message("gatherOpt_background")}<span class="text-muted-foreground block text-[12px]">{i18n.message("gatherOpt_backgroundLine")}</span></span>
      </label>
      <label class={clsx("flex items-start gap-2", !hasPlaylist && "opacity-60")}>
        <input type="checkbox" class="mt-1" aria-describedby={hasPlaylist ? undefined : `${uid}-needs`} checked={gather.auto.count} onchange={event => auto("gather.auto.count", event)} />
        <span>{i18n.message("gatherOpt_count")}
          <select aria-label={i18n.message("gatherOpt_countLabel")} class="border-input bg-background ml-1 h-7 rounded border px-1" disabled={!hasPlaylist} value={String(gather.auto.n)}
            onchange={event => save({ kind: "option", field: "gather.auto.n", value: Number(event.currentTarget.value) as 5 | 10 | 15 | 20 | 30 | 50 })}>
            {#each [5, 10, 15, 20, 30, 50] as n (n)}<option value={String(n)}>{i18n.number(n)}</option>{/each}
          </select>
          <span class="text-muted-foreground block text-[12px]">{i18n.message("gatherOpt_countLine")}</span></span>
      </label>
      <p class="text-muted-foreground text-[12px]">{i18n.message("gatherOpt_never")}</p>
    </fieldset>
    {#if failed}<p role="status" class="text-destructive text-[12px]">{i18n.message("option_failed")}</p>{/if}
  </div>
{/if}
