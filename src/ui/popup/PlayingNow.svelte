<script lang="ts">
  import { untrack } from "svelte"
  import Button from "../components/Button.svelte"
  import type { PlayingNow } from "../../shared/contracts/playing-now"
  import { isPlaylistId, type AccountKey } from "../../shared/model/validation"
  import type { UndoHandle } from "../../shared/contracts/tab-actions"
  import DestinationChooser from "../features/DestinationChooser.svelte"
  import type { PageState } from "../lib/page-state.svelte"
  import type { SheetTarget } from "../features/source"
  import Glyph from "../components/Glyph.svelte"

  // Playing now (UI-POP-17): the playing song with Save to the YouTube Music quick-save playlist, answered inline.
  let { pageState, onsave }: { pageState: PageState; onsave?: (target: SheetTarget) => void } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  let playing = $state.raw<UiPlayingNow | null>(null)
  let saving = $state(false)
  let result = $state<string | null>(null)
  // A confirmed save offers Undo in its line, in the same tab as the same account (YM-POP-3).
  let undo = $state.raw<{ readonly tabId: number; readonly acct: AccountKey; readonly handle: UndoHandle } | null>(null)
  void backend.call("ui.playingNow", {}).then(answer => { playing = answer.kind === "answered" ? answer.result : { kind: "unavailable" } })
  const entry = $derived(playing?.kind === "song" ? pageState.ready?.setups.find(row => row.acct === playing.acct) : undefined)
  const target = $derived(entry && isPlaylistId(entry.setup.musicSave) ? entry.setup.musicSave : null)
  const title = $derived(target ? pageState.title(target, playing?.kind === "playing" ? playing.acct : null) ?? i18n.message("picker_titleUnavailable") : null)
  async function save() {
    if (playing?.kind !== "song" || !target || !title) return
    saving = true; result = null; undo = null
    const answer = await backend.call("ui.add", { tabId: playing.tabId, acct: playing.acct,
      request: { site: "music", video: playing.song.videoId, title: playing.song.title, via: "quick-save", opener: "playing-now" } })
    saving = false
    const reply = answer.kind === "answered" ? answer.result : null
    result = reply && "text" in reply ? reply.text : reply?.kind === "account-changed" ? i18n.message("playing_accountChanged")
      : reply?.kind === "no-tab" ? i18n.message("playing_tabClosed") : reply?.kind === "signed-out" ? i18n.message("playing_signedOut")
      : reply?.kind === "choose" ? i18n.message("playing_firstPick") : i18n.message("playing_failed")
    if (reply?.kind === "added" && reply.undo) undo = { tabId: playing.tabId, acct: playing.acct, handle: reply.undo }
  }
  async function takeBack() {
    const pending = undo
    if (!pending || saving) return
    saving = true
    const answer = await backend.call("ui.addUndo", pending)
    saving = false
    const reply = answer.kind === "answered" ? answer.result : null
    if (reply?.kind === "undone") { undo = null; result = null; return }
    undo = reply?.kind === "failed" || reply === null ? pending : null
    result = reply?.kind === "failed" ? reply.text : reply?.kind === "account-changed" ? i18n.message("playing_accountChanged")
      : reply?.kind === "no-tab" ? i18n.message("playing_tabClosed") : i18n.message("feedback_www_manual_untitled_undo_failed")
  }
</script>

{#if playing?.kind === "playing"}
  <section class="bg-card flex flex-col gap-2 rounded-xl border p-3" aria-label={i18n.message("playing_title")} data-playing-now>
    <div class="flex items-center gap-3">
      {#if playing.song.artwork}<img src={playing.song.artwork} alt="" class="size-12 shrink-0 rounded-md object-cover" />{/if}
      <div class="min-w-0 flex-1">
        <p class="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{i18n.message("playing_title")}</p>
        <p class="truncate text-[13.5px] font-medium">{playing.song.title}</p>
        <p class="text-muted-foreground truncate text-[12px]">{playing.song.artist}</p>
      </div>
      <span class="flex shrink-0">
        {#if target && title}
          <Button size="sm" pending={saving} class={onsave ? "rounded-r-none" : ""} aria-label={i18n.message("playing_saveTo", { song: playing.song.title, playlist: title })} onclick={save}>{i18n.message("playing_save")}</Button>
        {/if}
        {#if onsave}
          {@const song = playing}
          <Button size="sm" variant={target && title ? "default" : "outline"} class={target && title ? "rounded-l-none border-l border-l-white/30 px-1.5" : ""} aria-label={i18n.message("musicAction_savePicker")}
            onclick={() => onsave({ tabId: song.tabId, acct: song.acct, site: "music", video: song.song.videoId, title: song.song.title, opener: "playing-now" })}><Glyph name="chevron-down" /></Button>
        {/if}
      </span>
    </div>
    {#if result}<p role="status" class="text-[12px]">{result}{#if undo} <Button variant="link" size="sm" disabled={saving} onclick={takeBack}>{i18n.message("toast_action_undo")}</Button>{/if}</p>{/if}
    {#if title}
      <p class="text-muted-foreground text-[12px]">{i18n.message("playing_oneClick", { playlist: title })}</p>
    {:else}
      <p class="text-muted-foreground text-[12px]">{i18n.message("playing_firstPick")}</p>
      <DestinationChooser {pageState} site="music" destination={{ kind: "music-save" }} label={i18n.message("music_saveName")}
        purpose={{ kind: "named", title: i18n.message("music_saveName"), subtitle: i18n.message("music_saveSubtitle") }} />
    {/if}
  </section>
{:else if playing?.kind === "signed-out"}
  <p class="text-muted-foreground px-1 text-[12.5px]">{i18n.message("playing_signedOut")}</p>
{:else if playing?.kind === "no-tab"}
  <section class="bg-info-soft rounded-xl p-3 text-[12.5px]" role="status">
    <p class="font-semibold">{i18n.message("banner_noMusicTab_title")}</p>
    <p class="text-muted-foreground">{i18n.message("banner_noMusicTab_text")}</p>
    <Button size="sm" variant="outline" class="mt-2" onclick={() => pageState.page.open("https://music.youtube.com/")}>{i18n.message("banner_openMusic")}</Button>
  </section>
{/if}
