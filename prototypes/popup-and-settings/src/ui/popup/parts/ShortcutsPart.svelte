<script lang="ts">
  import "./parts.css";
  // Playlist shortcuts, unfolded in the popup (ticket 08): each shortcut's key (the one recorder), its label, and
  // this account's playlist for it; Add shortcut (recording starts at once), Remove with a 6 s Undo, at most 20.
  // Keys and labels are shared by every account; the playlist is per account (ticket 11).
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Plus from "@lucide/svelte/icons/plus";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Clock from "@lucide/svelte/icons/clock";
  import CircleAlert from "@lucide/svelte/icons/circle-alert";
  import KeyRecorder from "$ui/components/KeyRecorder.svelte";
  import { Button } from "$ui/components/ui/button/index.js";
  import type { Shortcut } from "$shared/model/types";
  import { accountInView, act, labelOf, MAX_SHORTCUTS, shortcutName, shortcutTarget, titleOf, ui } from "$lib/view.svelte";
  import { openPicker } from "../sheet.svelte";

  const acct = $derived(accountInView());
  const list = $derived(ui.s.features.shortcuts.list);
  let fresh = $state<string | null>(null);
  let removed = $state<null | { name: string; undo: () => void; timer: ReturnType<typeof setTimeout> }>(null);

  async function add() {
    const before = new Set(list.map((s) => s.id));
    await act({ kind: "shortcutAdd" });
    fresh = ui.s.features.shortcuts.list.find((s) => !before.has(s.id))?.id ?? null;
  }
  function remove(s: Shortcut) {
    const at = list.findIndex((x) => x.id === s.id);
    const targets = Object.entries(ui.s.setups)
      .filter(([, st]) => st?.shortcutTargets[s.id])
      .map(([a, st]) => [a, st!.shortcutTargets[s.id]] as [never, string]);
    const snapshot = $state.snapshot(s);
    const name = shortcutName(s);
    act({ kind: "shortcutRemove", id: s.id });
    if (removed) clearTimeout(removed.timer);
    removed = {
      name,
      undo: () => act({ kind: "shortcutRestore", shortcut: snapshot, at, targets }),
      timer: setTimeout(() => (removed = null), 6000),
    };
  }
  function choose(s: Shortcut) {
    if (!acct) return;
    openPicker({
      mode: "choose",
      site: "youtube",
      acct,
      title: s.label ? `Playlist for ${s.label}` : "Playlist for this shortcut",
      subtitle: `For ${labelOf(acct).name}. Watch later works on every account.`,
      selected: shortcutTarget(acct, s),
      purpose: "shortcut",
      onchoose: (playlist) => act({ kind: "shortcutTarget", acct, id: s.id, playlist }),
    });
  }
</script>

<div class="space-y-2">
  <ul class="space-y-2">
    {#each list as s (s.id)}
      {@const target = shortcutTarget(acct, s)}
      <li class="bg-muted/40 rounded-xl border p-2">
        <div class="flex items-start gap-1">
          <div class="min-w-0 flex-1">
            <KeyRecorder
              value={s.key}
              ownerId="shortcut:{s.id}"
              site="both"
              autostart={fresh === s.id}
              onchange={(key) => act({ kind: "shortcut", id: s.id, key })}
            >
              {#snippet trailing()}
                <input
                  class="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/40 placeholder:text-muted-foreground h-8 min-w-0 flex-1 rounded-lg border px-2 text-xs outline-none focus-visible:ring-3"
                  placeholder="Label (optional)"
                  title={target ? `Shown instead of “${titleOf(target)}”` : "Your own name for this shortcut"}
                  maxlength={40}
                  value={s.label}
                  aria-label="Label"
                  onchange={(e) => act({ kind: "shortcut", id: s.id, label: (e.currentTarget as HTMLInputElement).value.trim() })}
                />
              {/snippet}
            </KeyRecorder>
          </div>
          <button
            type="button"
            class="text-muted-foreground hover:bg-destructive-soft hover:text-destructive inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
            aria-label="Remove {shortcutName(s)}"
            title="Remove shortcut"
            onclick={() => remove(s)}><Trash2 class="size-4" /></button
          >
        </div>
        <button
          type="button"
          class="hover:bg-card mt-1 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-xs disabled:opacity-60"
          disabled={!acct}
          onclick={() => choose(s)}
        >
          {#if target === "WL"}<Clock class="text-primary size-3.5 shrink-0" />{:else if !target}<CircleAlert class="text-warning size-3.5 shrink-0" />{/if}
          <span class="min-w-0 flex-1 truncate">
            {#if !acct}Sign in to choose its playlist
            {:else if !target}<span class="text-warning">No playlist on {labelOf(acct).name} yet</span>
            {:else}Saves to <span class="font-medium">{target === "WL" ? "Watch later (every account)" : titleOf(target)}</span>{/if}
            {#if target && ui.s.marks[target]}<span class="text-destructive font-medium"> · {ui.s.marks[target] === "full" ? "Full" : "Missing"}</span>{/if}
          </span>
          <ChevronRight class="text-muted-foreground size-3.5" />
        </button>
      </li>
    {/each}
  </ul>

  {#if removed}
    <div class="bg-foreground text-background flex items-center gap-2 rounded-lg px-3 py-2 text-xs" role="status">
      <span class="min-w-0 flex-1 truncate">Removed {removed.name}.</span>
      <button
        type="button"
        class="font-semibold underline-offset-2 hover:underline"
        onclick={() => {
          removed?.undo();
          clearTimeout(removed!.timer);
          removed = null;
        }}>Undo</button
      >
    </div>
  {/if}

  <div class="flex items-center gap-2">
    <Button size="sm" variant="outline" disabled={list.length >= MAX_SHORTCUTS} onclick={add}><Plus />Add shortcut</Button>
    <span class="text-muted-foreground text-[11.5px]">{list.length} of {MAX_SHORTCUTS}</span>
  </div>
  {#if list.length >= MAX_SHORTCUTS}<p class="text-muted-foreground text-[11.5px]">You can have up to 20 playlist shortcuts.</p>{/if}
  <p class="text-muted-foreground text-[11.5px] leading-4">Keys work while a YouTube or YouTube Music page is in focus.</p>
</div>
