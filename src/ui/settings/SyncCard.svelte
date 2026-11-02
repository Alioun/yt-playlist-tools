<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Switch from "../components/Switch.svelte"
  import type { createFeatureCopy } from "../onboarding/features"
  import type { PageState } from "../lib/page-state.svelte"
  import type { UiSync } from "../../shared/contracts/ui-pages"

  // Settings sync in Settings › Everywhere (UI-SET-12, UI-SET-13, SYNC-08, SYNC-19, SYNC-24). The switch shows the stored
  // state: it stays off while the join question waits, and turns on only once a join applied.
  let { pageState, features }: { pageState: PageState; features: ReturnType<typeof createFeatureCopy> } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  const device = $derived(pageState.ready?.device.kind === "current" ? pageState.ready.device.device : null)
  const status = $derived(pageState.ready?.sync?.status ?? "off")
  // SYNC-14: kept filters are those of playlists their account no longer auto-adds to.
  const keptFilters = $derived((pageState.ready?.setups ?? []).reduce((count, row) =>
    count + [...row.filters.keys()].filter(playlist => !row.setup.autoAdd.some(entry => entry.pl === playlist)).length, 0))
  let removing = $state(false), removeFailed = $state(false)
  async function removeKept() {
    removing = true; removeFailed = false
    try {
      const answer = await backend.call("ui.removeKeptFilters", {})
      removeFailed = !(answer.kind === "answered" && answer.result.kind === "removed")
    } finally { removing = false }
  }

  let busy = $state<"looking" | "off" | "use-synced" | "use-this-browser" | "cancel" | null>(null)
  let question = $state<string | null>(null)
  let line = $state<string | null>(null)
  const largestKey = { settings: "set_syncJoin_largestSettings", setup: "set_syncJoin_largestSetup", filter: "set_syncJoin_largestFilter" } as const
  function refusal(result: UiSync | null, off: boolean): string | null {
    if (result?.kind === "on" || result?.kind === "off" || result?.kind === "choose") return null
    if (result?.kind === "refused" && result.reason === "sync-full") {
      const largest = result.largest ? ` ${i18n.message(largestKey[result.largest.kind], { size: i18n.number(Math.ceil(result.largest.bytes / 1024)) })}` : ""
      return i18n.message("set_syncJoin_full") + largest
    }
    if (result?.kind === "refused" && result.reason === "unconfirmed") return i18n.message("set_sync_unconfirmed")
    if (off) return i18n.message("set_syncOff_failed")
    if (result?.kind === "refused" && result.reason === "update-needed") return i18n.message("set_syncJoin_updateNeeded")
    if (result?.kind === "refused" && result.reason === "changed") return i18n.message("set_syncJoin_changed")
    return i18n.message("set_syncJoin_failed")
  }
  async function send(step: NonNullable<typeof busy>, payload: Parameters<typeof backend.call<"ui.sync">>[1]) {
    if (busy) return
    busy = step; line = null
    try {
      const answer = await backend.call("ui.sync", payload)
      const result = answer.kind === "answered" ? answer.result : null
      question = result?.kind === "choose" ? result.token : null
      line = refusal(result, payload.action === "off")
    } finally { busy = null }
  }
  // UI-SET-13: two large choices that apply on click, the synced settings first as the default.
  const choices = [["use-synced", "set_syncJoin_useSynced", "set_syncJoin_useSyncedLine"], ["use-this-browser", "set_syncJoin_useThis", "set_syncJoin_useThisLine"]] as const
  const join = () => send("looking", { action: "join" })
  function flip(on: boolean) {
    if (on) void join()
    else void send("off", { action: "off" })
  }

  const syncLine = $derived(busy === "looking" || device?.syncOn && status === "joining" ? i18n.message("set_sync_joining") : !device?.syncOn ? i18n.message("set_sync_off")
    : status === "full" ? i18n.message("sync_full") : status === "update-needed" ? i18n.message("sync_updateNeeded") : i18n.message("set_sync_ok"))
</script>

<section id="feature-sync" data-feature-card="sync" class="bg-card rounded-2xl border p-5">
  <div class="flex items-start gap-3">
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] font-semibold">{features.syncFeature.name}</h3>
      <p class="text-muted-foreground mt-1 text-[13.5px]">{i18n.message(platform.browser === "firefox" ? "set_syncHelp_firefox" : "set_syncHelp_chrome")}</p>
      {#if device?.syncOn && status === "waiting" && !question}
        <!-- R153: a later history's question waits here until the user opens it. -->
        <Button size="sm" variant="link" class="mt-1 -ml-2.5" pending={busy === "looking"} onclick={join}>{i18n.message("banner_sync_waiting")}</Button>
      {:else}
        <p class="mt-2 text-[13.5px]" role="status">{syncLine}</p>
      {/if}
      {#if device?.syncOn && status === "full" && keptFilters > 0}
        <div class="mt-2 flex flex-col items-start gap-1">
          <Button size="sm" variant="outline" pending={removing} onclick={removeKept}>{i18n.message("sync_removeKeptFilters")}</Button>
          <p class="text-muted-foreground text-[12.5px]">{i18n.message("sync_removeKeptFilters_hint")}</p>
          {#if removeFailed}<p role="status" class="text-destructive text-[12.5px]">{i18n.message("filter_failed")}</p>{/if}
        </div>
      {/if}
      {#if line}<p role="status" class="text-destructive mt-1 text-[12.5px]">{line}</p>{/if}
    </div>
    <Switch checked={device?.syncOn ?? false} label={features.syncFeature.name} disabled={!pageState.agreed || busy !== null || question !== null} onchange={flip} />
  </div>
  {#if question}
    {@const token = question}
    <div role="dialog" aria-labelledby="sync-join-title" aria-describedby="sync-join-lead" class="bg-muted/40 mt-4 flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <h4 id="sync-join-title" class="text-[14.5px] font-semibold">{i18n.message("set_syncJoin_title")}</h4>
        <p id="sync-join-lead" class="text-muted-foreground mt-1 text-[13px]">{i18n.message("set_syncJoin_lead")}</p>
      </div>
      {#each choices as [choice, name, detail] (choice)}
        <Button variant={choice === "use-synced" ? "default" : "outline"} size="lg" class="w-full" pending={busy === choice} disabled={busy !== null && busy !== choice}
          onclick={() => send(choice, { action: "choose", token, choice })}>
          <span class="flex w-full flex-col items-start gap-0.5 text-left"><span>{i18n.message(name)}</span>
            <span class="text-[12.5px] font-normal opacity-80">{i18n.message(detail)}</span></span>
        </Button>
      {/each}
      <Button size="sm" variant="ghost" class="self-start" pending={busy === "cancel"} disabled={busy !== null && busy !== "cancel"}
        onclick={() => send("cancel", { action: "cancel", token })}>{i18n.message("set_cancel")}</Button>
    </div>
  {/if}
</section>
