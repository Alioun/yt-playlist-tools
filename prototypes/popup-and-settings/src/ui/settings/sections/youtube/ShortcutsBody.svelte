<script lang="ts">
  import "../../settings-more.css";
  // Playlist shortcuts (ticket 08): up to 20, each a key, an optional name (shared by every account) and the
  // playlist it saves to on the account in view. Remove has no confirmation: a 6 s Undo covers it. Below, the picker
  // key and the undo key, YouTube Music, and feedback.
  import Plus from "@lucide/svelte/icons/plus";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Info from "@lucide/svelte/icons/info";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import { Button } from "$ui/components/ui/button/index.js";
  import KeyRecorder from "$ui/components/KeyRecorder.svelte";
  import PlaylistChooser from "$ui/components/picker/PlaylistChooser.svelte";
  import OptionRow from "../../parts/OptionRow.svelte";
  import Subhead from "../../parts/Subhead.svelte";
  import { access, accountInView, accountsWithSetup, act, labelOf, MAX_SHORTCUTS, shortcutName, shortcutTarget, titleOf, ui } from "$lib/view.svelte";
  import type { Change } from "$ui/backend/backend";
  import type { AccountId } from "$shared/model/types";

  const f = $derived(ui.s.features.shortcuts);
  const acct = $derived(accountInView());
  const full = $derived(f.list.length >= MAX_SHORTCUTS);
  const musicAccess = $derived(ui.s.env.access.music);

  let removed = $state<null | { name: string; restore: Change; at: number }>(null);
  /** Add shortcut adds a row and starts recording its key at once (ticket 08). */
  let newest = $state<string | null>(null);
  async function add() {
    const r = await act({ kind: "shortcutAdd" });
    if (r.ok) newest = ui.s.features.shortcuts.list.at(-1)?.id ?? null;
  }
  function remove(id: string) {
    const i = f.list.findIndex((s) => s.id === id);
    if (i < 0) return;
    const s = $state.snapshot(f.list[i]);
    const targets: [AccountId, string][] = [];
    for (const a of accountsWithSetup()) {
      const t = ui.s.setups[a]?.shortcutTargets[id];
      if (t) targets.push([a, t]);
    }
    const name = shortcutName(f.list[i]);
    act({ kind: "shortcutRemove", id });
    const at = Date.now();
    removed = { name, restore: { kind: "shortcutRestore", shortcut: s, at: i, targets }, at };
    setTimeout(() => removed?.at === at && (removed = null), 6000);
  }
</script>

<Subhead title="Shortcuts" aside="{f.list.length} of {MAX_SHORTCUTS}" />

<div class="px-5">
  <div class="text-muted-foreground grid grid-cols-[188px_minmax(0,1fr)_minmax(0,1.2fr)_32px] gap-3 px-1 pb-1.5 text-xs font-medium">
    <span>Key</span>
    <span>Name <span class="font-normal">(optional)</span></span>
    <span>Saves to{acct ? ` on ${labelOf(acct).name}` : ""}</span>
    <span></span>
  </div>
  <ul class="divide-y rounded-xl border">
    {#each f.list as s (s.id)}
      {@const target = shortcutTarget(acct, s)}
      <li class="grid grid-cols-[188px_minmax(0,1fr)_minmax(0,1.2fr)_32px] items-center gap-3 px-3 py-2.5">
        <div><KeyRecorder
            value={s.key}
            ownerId="shortcut:{s.id}"
            site="both"
            autostart={s.id === newest}
            onchange={(key) => act({ kind: "shortcut", id: s.id, key })}
          /></div>
        <input
          class="border-input bg-card placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-ring/40 h-8 w-full min-w-0 rounded-lg border px-2.5 text-[13px] outline-none focus-visible:ring-3"
          value={s.label}
          maxlength={40}
          placeholder={target ? titleOf(target) : "Name it"}
          aria-label="Name for this shortcut"
          onchange={(e) => act({ kind: "shortcut", id: s.id, label: e.currentTarget.value.trim() })}
          onkeydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <div class="min-w-0">
          {#if acct}
            <PlaylistChooser
              {acct}
              purpose="shortcut"
              selected={target}
              title="Playlist for {shortcutName(s)}"
              subtitle="Watch later works on every account. Any other playlist is for {labelOf(acct).name} only."
              placeholder="Choose a playlist"
              onchoose={(playlist) => act({ kind: "shortcutTarget", acct, id: s.id, playlist })}
            />
          {:else}
            <span class="text-muted-foreground text-[13px]">Sign in to choose</span>
          {/if}
        </div>
        <button
          type="button"
          class="text-muted-foreground hover:bg-destructive-soft hover:text-destructive inline-flex size-8 items-center justify-center rounded-lg"
          aria-label="Remove {shortcutName(s)}"
          title="Remove shortcut"
          onclick={() => remove(s.id)}><Trash2 class="size-4" /></button
        >
      </li>
    {/each}
    {#if removed}
      <li class="bg-muted/40 flex items-center gap-3 px-3 py-2.5 text-[13px]" role="status">
        <Undo2 class="text-muted-foreground size-4" />
        <span class="flex-1">Removed {removed.name}.</span>
        <Button
          size="sm"
          variant="ghost"
          onclick={() => {
            if (removed) act(removed.restore);
            removed = null;
          }}>Undo</Button
        >
      </li>
    {/if}
    {#if !f.list.length && !removed}
      <li class="text-muted-foreground px-3 py-4 text-[13px]">No shortcuts yet. Add one and press the key you want.</li>
    {/if}
  </ul>
  <div class="flex items-center gap-3 py-3">
    <Button size="sm" variant="outline" disabled={full} onclick={add}><Plus />Add shortcut</Button>
    {#if full}<span class="text-muted-foreground text-[13px]">You can have up to 20 playlist shortcuts.</span>{/if}
  </div>
</div>

<div class="border-t">
  <Subhead title="Two more keys" />
  <div class="divide-y">
    <OptionRow label="Save to playlist…" description="Opens the playlist picker for the video you're pointing at or watching, with its search ready for typing.">
      {#snippet control()}<KeyRecorder value={f.pickerKey} ownerId="picker" site="youtube" onchange={(key) => act({ kind: "key", which: "picker", key })} />{/snippet}
    </OptionRow>
    <OptionRow label="Undo" description="Undoes the save on screen. The same key works for YouTube Music's quick actions.">
      {#snippet control()}<KeyRecorder value={ui.s.undoKey} ownerId="undo" site="both" onchange={(key) => act({ kind: "key", which: "undo", key })} />{/snippet}
    </OptionRow>
  </div>
</div>

<div class="divide-y border-t">
  <OptionRow
    label="Also on YouTube Music"
    description="The same keys save the song you're pointing at or playing on music.youtube.com."
    checked={f.onMusic}
    onchange={(v) => act({ kind: "featureOption", id: "shortcuts", option: "onMusic", value: v })}
  >
    {#if f.onMusic && !musicAccess}
      <div class="mt-2 flex flex-wrap items-center gap-2.5">
        <span class="text-warning text-[13px]">Needs access to YouTube Music.</span>
        <Button size="xs" variant="outline" onclick={() => access.request("music")}>Give access</Button>
      </div>
    {/if}
  </OptionRow>
  <OptionRow
    label="Show a confirmation when a shortcut saves"
    description="Failures, and keys that did nothing, always show."
    checked={f.feedback}
    onchange={(v) => act({ kind: "featureOption", id: "shortcuts", option: "feedback", value: v })}
  />
</div>

<div class="text-muted-foreground flex items-start gap-2.5 border-t px-5 py-3.5 text-[13px] leading-5">
  <Info class="mt-0.5 size-4 shrink-0" />
  <p>
    Shortcuts work while a YouTube or YouTube Music page is in focus. If one does nothing, the browser or another extension may be using
    that key.
  </p>
</div>
