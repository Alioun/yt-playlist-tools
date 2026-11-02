<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import Glyph from "../components/Glyph.svelte"
  import { display } from "../../shared/keys"
  import type { RecentEntry } from "../../shared/contracts/ui-pages"
  import type { AccountKey } from "../../shared/model/validation"
  import type { PageState } from "../lib/page-state.svelte"
  import { relativeTime } from "../lib/time"

  // The Recent adds sheet (UI-POP-34): this browser session's adds for the account shown, newest first. It changes nothing.
  let { pageState, acct, onclose }: { pageState: PageState; acct: AccountKey; onclose: () => void } = $props()
  const { i18n, backend, platform } = untrack(() => pageState.page)
  let entries = $state<readonly RecentEntry[] | null | "failed">(null)
  void backend.call("ui.recentAdds", { acct: untrack(() => acct) }).then(answer => {
    entries = answer.kind === "answered" && answer.result.kind === "recent" ? answer.result.entries : "failed"
  })
  // What AddFlow writes: the feature that made the add, or its opener for a pick (DATA-52).
  const sources: Readonly<Record<string, Parameters<typeof i18n.message>[0]>> = {
    "auto-add": "recent_source_autoAdd", "quick-save": "recent_source_quickSave", "browser-menu": "recent_source_browserMenu", gather: "recent_source_gather",
    "auto-gather": "recent_source_autoGather", picker: "recent_source_picker", "watch-button": "recent_source_watchButton", "music-actions": "recent_source_musicActions",
    "playing-now": "playing_title", popup: "recent_source_picker", shortcuts: "feature_name_2", "queue-button": "feature_name_4", "card-menu": "feature_name_6", "music-keys": "feature_name_10",
    "any-tab-keys": "feature_name_11"
  }
  function source(entry: RecentEntry): string {
    if (entry.source.kind === "shortcut") return display(entry.source.key, platform.os)
    return i18n.message(sources[entry.source.feature] ?? "recent_source_other")
  }
  const video = (id: string) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`
  const playlist = (id: string) => `https://www.youtube.com/playlist?list=${encodeURIComponent(id)}`
</script>

<div role="dialog" aria-modal="true" aria-labelledby="recent-heading" tabindex="-1"
  class="bg-card absolute inset-x-0 top-[58px] bottom-0 z-20 flex flex-col overflow-y-auto border-t p-4 shadow-lg"
  onkeydown={event => { if (event.key === "Escape") { event.stopPropagation(); onclose() } }}>
  <div class="flex items-start justify-between gap-2">
    <div>
      <h2 id="recent-heading" class="text-[15px] font-semibold">{i18n.message("recent_title")}</h2>
      <p class="text-muted-foreground text-[12px]">{i18n.message("recent_lead", { account: pageState.accountName(acct) })}</p>
    </div>
    <Button variant="ghost" size="sm" aria-label={i18n.message("recent_close")} onclick={onclose}><Glyph name="x" /></Button>
  </div>
  {#if entries === "failed"}
    <p role="status" class="text-muted-foreground mt-4 text-sm">{i18n.message("recent_unavailable")}</p>
  {:else if entries && entries.length === 0}
    <p class="text-muted-foreground mt-4 text-sm">{i18n.message("recent_empty")}</p>
  {:else if entries}
    <ul class="mt-3 flex flex-col gap-3 text-[13px]">
      {#each entries as entry, index (index)}
        <li class="flex flex-col gap-0.5">
          {#if entry.gather}
            <details>
              <summary class="cursor-pointer font-medium">{i18n.message("recent_gathered", { count: i18n.number(entry.videos.length), playlist: entry.playlists[0]?.title ?? "" })}</summary>
              <ul class="mt-1 flex flex-col gap-0.5 pl-3">
                {#each entry.videos as item (item.id)}<li><a class="hover:underline" href={video(item.id)} target="_blank" rel="noreferrer">{item.title}</a></li>{/each}
              </ul>
            </details>
          {:else}
            {#each entry.videos as item (item.id)}<a class="font-medium hover:underline" href={video(item.id)} target="_blank" rel="noreferrer">{item.title}</a>{/each}
            <span class="text-muted-foreground">{i18n.message("recent_to")}
              {#each entry.playlists as target, position (target.id)}{position ? ", " : " "}<a class="hover:underline" href={playlist(target.id)} target="_blank" rel="noreferrer">{target.title}</a>{/each}</span>
          {/if}
          <span class="text-muted-foreground text-[12px]">{source(entry)} · {relativeTime(i18n, entry.at)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>
