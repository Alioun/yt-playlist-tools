<script lang="ts">
  import type { SimpleMessageKey } from "../../shared/i18n"
  import clsx from "clsx"
  import { onDestroy, untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Glyph from "../components/Glyph.svelte"
  import type { PlaylistProgress, ThisTab } from "../../shared/contracts/this-video"
  import { watchStateText } from "../../shared/copy/watch"
  import { channelControls, type ChannelControl } from "../../shared/rules/channel-filter"
  import type { AccountKey, PlaylistId } from "../../shared/model/validation"
  import type { PageState } from "../lib/page-state.svelte"
  import type { SheetTarget } from "../features/source"

  // This video (UI-POP-12 to UI-POP-14): the active YouTube tab's video, as that tab's own account (UI-POP-08), with
  // the status line, the watched meter and, unfolded, each playlist's outcome, Don't auto-add and this channel's filters.
  let { pageState, onsave }: { pageState: PageState; onsave?: (target: SheetTarget) => void } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  let tab = $state.raw<ThisTab | null>(null)
  let open = $state(false)
  let busy = $state(false)
  let failure = $state<string | null>(null)
  let confirming = $state<{ readonly playlist: PlaylistId; readonly control: Extract<ChannelControl, { state: "confirm" }> } | null>(null)
  let again: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(again))
  async function read() {
    const answer = await backend.call("ui.thisTab", {})
    tab = answer.kind === "answered" ? answer.result : { kind: "unavailable" }
  }
  void read()
  // A change reaches the tab's page, then its auto-add, so the card reads the tab again a moment later (YT-AA-38).
  function reread() { clearTimeout(again); again = setTimeout(() => { void read() }, 400) }

  const shown = $derived(tab?.kind === "video" ? tab : null)
  const acct = $derived(shown?.acct ?? null)
  const entry = $derived(acct ? pageState.ready?.setups.find(row => row.acct === acct) : undefined)
  const name = (id: string) => pageState.title(id as PlaylistId, acct) ?? i18n.message("picker_titleUnavailable")
  const line = $derived.by(() => {
    if (!shown) return null
    const { state } = shown.video
    if (state.kind === "not-tracked" && (entry?.setup.autoAdd.length ?? 0) === 0) return i18n.message("summary_autoAdd_none", { account: pageState.accountName(acct) })
    return watchStateText(state, { name, title: shown.video.title }, i18n).status
  })
  const reached = (row: PlaylistProgress) => row.outcome === "added" || row.outcome === "already-in" || (shown?.video.watched ?? 0) >= row.pct
  const outcomes: Readonly<Record<Exclude<PlaylistProgress["outcome"], "waiting">, SimpleMessageKey>> = {
    added: "thisVideo_outcome_added", "already-in": "thisVideo_outcome_alreadyIn", filtered: "thisVideo_outcome_filtered", failed: "thisVideo_outcome_failed", skipped: "thisVideo_outcome_skipped"
  }
  const outcome = (row: PlaylistProgress) => row.outcome === "waiting" ? i18n.message("thisVideo_outcome_waiting", { percent: i18n.number(row.pct) }) : i18n.message(outcomes[row.outcome])
  const skipped = $derived(shown?.video.state.kind === "skipped")

  async function skip(next: boolean) {
    if (!shown || busy) return
    busy = true; failure = null
    const answer = await backend.call("ui.skip", { tabId: shown.tabId, acct: shown.acct, video: shown.video.video, skip: next })
    busy = false
    if (answer.kind === "answered" && answer.result.kind !== "refused") reread()
    else failure = i18n.message("thisVideo_skipFailed")
  }
  async function resume() {
    busy = true; failure = null
    const answer = await backend.call("ui.pause", { paused: false })
    busy = false
    if (answer.kind === "answered" && answer.result.kind === "paused") { void pageState.refreshStatus(); reread() } else failure = i18n.message("pop_pauseFailed")
  }
  async function channel(playlist: PlaylistId, control: ChannelControl) {
    const found = shown?.video.channel
    if (!shown || !found || control.state === "greyed" || busy) return
    if (control.state === "confirm" && confirming?.playlist !== playlist) { confirming = { playlist, control }; return }
    confirming = null
    busy = true; failure = null
    const send = control.send
    const answer = await backend.call("ui.filterChannel", { change: { acct: shown.acct as AccountKey, playlist,
      channel: found.handle ? [found.id, found.title, found.handle] : [found.id, found.title], action: send.action, mode: send.mode, clearListed: send.clearListed,
      expectedGeneration: send.clearListed ? entry?.filterGens.get(playlist) ?? null : null } })
    busy = false
    if (answer.kind === "answered" && answer.result.kind === "confirmed") reread()
    else failure = i18n.message("filter_failed")
  }
  const controlLabel = (control: ChannelControl) => control.state === "listed"
    ? i18n.message(control.mode === "allow" ? "channelFilter_allowed" : "channelFilter_denied")
    : i18n.message(control.mode === "allow" ? "channelFilter_allowOnly" : "channelFilter_deny")
</script>

{#if tab === null || shown}
<section class="bg-card min-h-[86px] rounded-xl border p-3" aria-label={i18n.message("thisVideo_heading")} data-this-video>
  {#if shown}
    <p class="truncate text-[13px]"><span class="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{i18n.message("thisVideo_heading")}</span>
      {#if shown.video.title}<span class="text-muted-foreground"> · </span><span class="font-medium">{shown.video.title}</span>{/if}</p>
    <p class="mt-1 text-[12.5px]" role="status">{line}
      {#if shown.video.state.kind === "paused"}<Button variant="link" size="sm" disabled={busy} onclick={resume}>{i18n.message("pop_resume")}</Button>{/if}
      {#if skipped}<Button variant="link" size="sm" disabled={busy} onclick={() => skip(false)}>{i18n.message("toast_action_undo")}</Button>{/if}
    </p>
    {#if shown.video.playlists.length}
      {@const watched = shown.video.watched ?? 0}
      <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={watched} aria-label={i18n.message("thisVideo_meter", { watched: i18n.number(watched) })}
        class="bg-muted relative mt-2 h-1.5 rounded-full" data-meter>
        <div class="h-full rounded-full bg-gradient-to-r from-[var(--brand-teal)] to-[var(--brand-violet)]" style:width="{watched}%"></div>
        {#each shown.video.playlists as row (row.pl)}
          <span class={clsx("absolute -top-0.5 h-2.5 w-0.5 rounded", reached(row) ? "bg-[var(--brand-teal)]" : "bg-muted-foreground/60")} style:left="{row.pct}%"
            data-goal={row.pct} data-reached={reached(row)}></span>
        {/each}
      </div>
    {/if}
    {#if shown.video.state.kind !== "not-tracked" || shown.video.playlists.length || onsave}
      <button type="button" aria-expanded={open} class="text-primary mt-2 flex items-center gap-0.5 text-[12.5px] font-medium" onclick={() => { open = !open }}>
        {i18n.message("thisVideo_details")}<Glyph name={open ? "chevron-down" : "chevron-right"} class="size-3.5" /></button>
    {/if}
    {#if open}
      <div class="mt-2 flex flex-col gap-2 text-[12.5px]" data-this-video-details>
        <ul class="flex flex-col gap-1">
          {#each shown.video.playlists as row (row.pl)}
            <li class="flex justify-between gap-2"><span class="truncate">{name(row.pl)}</span><span class="text-muted-foreground shrink-0">{outcome(row)}</span></li>
          {/each}
        </ul>
        {#if shown.video.playlists.length}
          <Button size="sm" variant="outline" class="self-start" pending={busy} onclick={() => skip(!skipped)}>
            {i18n.message(skipped ? "thisVideo_autoAddAgain" : "thisVideo_dontAutoAdd")}</Button>
          <div class="flex flex-col gap-1.5">
            {#if shown.video.channel}
              {@const found = shown.video.channel}
              <p class="font-medium">{i18n.message("thisVideo_channelFilters", { channel: found.title || found.handle || found.id })}</p>
              {#each shown.video.playlists as row (row.pl)}
                {@const controls = channelControls(entry?.filters.get(row.pl), found.id)}
                <div class="flex flex-wrap items-center gap-1.5" data-channel-row={row.pl}>
                  <span class="min-w-0 flex-1 truncate">{name(row.pl)}</span>
                  {#each controls as control (control.mode)}
                    <Button size="sm" variant={control.state === "listed" ? "default" : "outline"} disabled={busy || control.state === "greyed"} aria-pressed={control.state === "listed"}
                      title={control.state === "greyed" ? i18n.message(control.mode === "allow" ? "channelFilter_usesDeny" : "channelFilter_usesAllow", { playlist: name(row.pl) }) : undefined}
                      onclick={() => channel(row.pl, control)}>{controlLabel(control)}</Button>
                  {/each}
                </div>
                {#if confirming?.playlist === row.pl}
                  {@const ask = confirming.control}
                  <div class="bg-muted flex flex-wrap items-center gap-2 rounded-lg p-2" role="alertdialog" aria-label={i18n.message("filter_switchMode")}>
                    <span class="min-w-0 flex-1">{i18n.message(ask.mode === "allow" ? (i18n.plural(ask.kept) === "one" ? "channelFilter_turnOnAllow_one" : "channelFilter_turnOnAllow_other")
                      : (i18n.plural(ask.kept) === "one" ? "channelFilter_turnOnDeny_one" : "channelFilter_turnOnDeny_other"), { playlist: name(row.pl), count: i18n.number(ask.kept) })}</span>
                    <Button size="sm" onclick={() => channel(row.pl, ask)}>{i18n.message("filter_switchMode")}</Button>
                    <Button size="sm" variant="ghost" onclick={() => { confirming = null }}>{i18n.message("filter_cancel")}</Button>
                  </div>
                {/if}
              {/each}
            {:else}
              <p class="text-muted-foreground">{i18n.message("channelFilter_unknown")}</p>
            {/if}
          </div>
        {/if}
        {#if onsave}
          <Button size="sm" variant="outline" class="self-start" onclick={() => onsave({ tabId: shown.tabId, acct: shown.acct, site: "www", video: shown.video.video,
            title: shown.video.title, opener: "popup" })}>{i18n.message("quickSave_more")}</Button>
        {/if}
        {#if failure}<p role="status" class="text-destructive">{failure}</p>{/if}
      </div>
    {/if}
  {/if}
</section>
{/if}
