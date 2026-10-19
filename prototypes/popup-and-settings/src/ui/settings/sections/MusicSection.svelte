<script lang="ts">
  import Info from "@lucide/svelte/icons/info";
  import "../settings-more.css";
  // Settings › YouTube Music (tickets 26, 09): the section's own switch, Chrome's separate site access, Quick actions
  // (which buttons show), Quick-action shortcuts (a key each), the YouTube Music quick-save playlist once, under
  // whichever of the two is on, and playlist shortcuts' "here too".
  import Headphones from "@lucide/svelte/icons/headphones";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import { Switch } from "$ui/components/ui/switch/index.js";
  import { Checkbox } from "$ui/components/ui/checkbox/index.js";
  import { Button } from "$ui/components/ui/button/index.js";
  import KeyRecorder from "$ui/components/KeyRecorder.svelte";
  import PlaylistChooser from "$ui/components/picker/PlaylistChooser.svelte";
  import FeatureCard from "../parts/FeatureCard.svelte";
  import OptionRow from "../parts/OptionRow.svelte";
  import Subhead from "../parts/Subhead.svelte";
  import Callout from "../parts/Callout.svelte";
  import SectionHeader from "../parts/SectionHeader.svelte";
  import { musicButtons, musicKeyNames } from "$shared/features/registry";
  import type { MusicButton, MusicKeyAction } from "$shared/model/types";
  import { access, accountInView, act, labelOf, setupOf, ui } from "$lib/view.svelte";
  import { go } from "../route.svelte";

  const f = $derived(ui.s.features);
  const section = $derived(ui.s.musicSection);
  const acct = $derived(accountInView());
  const quickSave = $derived(setupOf(acct)?.musicQuickSave ?? null);
  const wanted = $derived(f.musicQuickActions.on || f.musicShortcuts.on || (f.shortcuts.on && f.shortcuts.onMusic));
  const needsAccess = $derived(section && wanted && !ui.s.env.access.music);
  const quickSaveUnder = $derived(f.musicQuickActions.on ? "actions" : f.musicShortcuts.on ? "keys" : null);
  const keyOrder: MusicKeyAction[] = ["playNext", "addToQueue", "save", "savePicker", "like", "remove"];

  async function setSection(on: boolean) {
    // Chrome asks for YouTube Music from the click that turns it on (ticket 10).
    if (on && wanted && !ui.s.env.access.music && !(await access.request("music"))) return;
    act({ kind: "musicSection", on });
  }
</script>

{#snippet quickSaveBlock()}
  <div class="border-t">
    <Subhead title={acct ? `Quick-save playlist for ${labelOf(acct).name}` : "Quick-save playlist"} />
    <div class="flex flex-wrap items-center gap-3 px-5 pb-4">
      {#if acct}
        <div class="max-w-[320px] min-w-0">
          <PlaylistChooser
            {acct}
            site="music"
            purpose="musicQuickSave"
            selected={quickSave}
            title="Quick-save playlist"
            subtitle="Save to playlist adds songs here in one click. ▾ still picks any playlist."
            placeholder="Ask the first time"
            onchoose={(playlist) => act({ kind: "quickSave", acct, site: "music", playlist })}
          />
        </div>
        <p class="text-muted-foreground max-w-[44ch] text-[13px] leading-5">
          Separate from YouTube's thumbnail quick-save: music and video playlists usually differ.
        </p>
      {:else}
        <p class="text-muted-foreground text-[13px]">Sign in to YouTube Music to choose it.</p>
      {/if}
    </div>
  </div>
{/snippet}

<SectionHeader
  title="YouTube Music"
  description="Quick actions and keys on music.youtube.com, in the installed YouTube Music app too. Auto-add and channel filters stay on YouTube."
/>

<div class="space-y-4">
  <div class="bg-card shadow-soft flex items-center gap-4 rounded-2xl border px-5 py-4">
    <span class="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px] {section ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground'}"
      ><Headphones class="size-5" /></span
    >
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] leading-6 font-semibold">On YouTube Music</h3>
      <p class="text-muted-foreground text-[13.5px] leading-5">
        {section
          ? "Your YouTube Music features below run on music.youtube.com."
          : "Off: nothing of ours runs on music.youtube.com. Your choices below are kept."}
      </p>
    </div>
    <Switch checked={section} aria-label="Playlist Pigeon on YouTube Music" onCheckedChange={setSection} />
  </div>

  {#if needsAccess}
    <Callout tone="attention" title="Playlist Pigeon doesn't have access to YouTube Music.">
      {ui.s.env.browser === "chrome"
        ? "Chrome asks for YouTube Music separately from YouTube. Your features stay on and start once you allow it."
        : "Firefox's access to YouTube covers YouTube Music; it was withheld or removed."}
      {#snippet actions()}<Button size="sm" onclick={() => access.request("music")}>Give access to YouTube Music</Button>{/snippet}
    </Callout>
  {/if}

  <FeatureCard id="musicQuickActions">
    <Subhead title="Buttons">
      <span class="text-muted-foreground text-xs">On hover; always on album and playlist headers</span>
    </Subhead>
    <ul class="grid gap-x-6 gap-y-1 px-5 pb-3 sm:grid-cols-2">
      {#each musicButtons as b (b.id)}
        <li>
          <label class="hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2">
            <Checkbox
              class="mt-0.5"
              checked={f.musicQuickActions.buttons[b.id as MusicButton]}
              onCheckedChange={(v) => act({ kind: "musicButton", button: b.id as MusicButton, on: !!v })}
            />
            <span class="min-w-0">
              <span class="block text-sm leading-5 font-medium">{b.name}</span>
              <span class="text-muted-foreground block text-[12.5px] leading-[18px]">{b.where}</span>
            </span>
          </label>
        </li>
      {/each}
      <li>
        <label class="hover:bg-muted/60 flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2">
          <Checkbox
            class="mt-0.5"
            checked={f.musicQuickActions.playerBarSave}
            onCheckedChange={(v) => act({ kind: "featureOption", id: "musicQuickActions", option: "playerBarSave", value: !!v })}
          />
          <span class="min-w-0">
            <span class="block text-sm leading-5 font-medium">Save on the player bar</span>
            <span class="text-muted-foreground block text-[12.5px] leading-[18px]">Shown beside YouTube Music's like, in the classic bar and the new miniplayer.</span>
          </span>
        </label>
      </li>
    </ul>
    <!-- Ticket 27: the one place our buttons visibly cost YouTube Music something. -->
    <p class="text-muted-foreground mx-5 mb-3 -mt-1 flex items-start gap-1.5 text-[12.5px] leading-[18px]">
      <Info class="mt-0.5 size-3.5 shrink-0" />Each extra button squeezes narrow rows more. On Home's Quick picks at common laptop widths, a hovered row's title can disappear; its tooltip still names the song.
    </p>
    {#if quickSaveUnder === "actions"}{@render quickSaveBlock()}{/if}
    <div class="border-t">
      <OptionRow
        label="Show a confirmation after each action"
        description="With Undo. Failures, and actions that did nothing, always show."
        checked={f.musicQuickActions.feedback}
        onchange={(v) => act({ kind: "featureOption", id: "musicQuickActions", option: "feedback", value: v })}
      />
    </div>
  </FeatureCard>

  <FeatureCard id="musicShortcuts">
    <Subhead title="Keys">
      <span class="text-muted-foreground text-xs">Act on the song you're pointing at, else the one playing</span>
    </Subhead>
    <ul class="divide-y border-y">
      {#each keyOrder as a (a)}
        <li class="flex items-center gap-4 px-5 py-2.5">
          <span class="min-w-0 flex-1 text-sm">{musicKeyNames[a]}</span>
          <div class="w-[200px] shrink-0">
            <KeyRecorder
              value={f.musicShortcuts.keys[a]}
              ownerId="music:{a}"
              site="music"
              onchange={(key) => act({ kind: "musicKey", action: a, key })}
            />
          </div>
        </li>
      {/each}
      <li class="flex items-center gap-4 px-5 py-2.5">
        <span class="min-w-0 flex-1 text-sm">
          Undo
          <span class="text-muted-foreground block text-[12.5px]">Shared with playlist shortcuts</span>
        </span>
        <div class="w-[200px] shrink-0">
          <KeyRecorder value={ui.s.undoKey} ownerId="undo" site="both" onchange={(key) => act({ kind: "key", which: "undo", key })} />
        </div>
      </li>
    </ul>
    {#if quickSaveUnder === "keys"}{@render quickSaveBlock()}{/if}
    <OptionRow
      label="Show a confirmation after each key"
      description="Keys that point at nothing, or at something they can't act on, always say why."
      checked={f.musicShortcuts.feedback}
      onchange={(v) => act({ kind: "featureOption", id: "musicShortcuts", option: "feedback", value: v })}
    />
  </FeatureCard>

  <div class="bg-card shadow-soft flex items-start gap-4 rounded-2xl border px-5 py-4">
    <span
      class="inline-flex size-[38px] shrink-0 items-center justify-center rounded-[10px] {f.shortcuts.on && f.shortcuts.onMusic
        ? 'bg-accent text-primary'
        : 'bg-muted text-muted-foreground'}"><Keyboard class="size-5" /></span
    >
    <div class="min-w-0 flex-1">
      <h3 class="text-[15px] leading-6 font-semibold">Playlist shortcuts here too</h3>
      <p class="text-muted-foreground text-[13.5px] leading-5">
        {#if f.shortcuts.on}
          Your playlist shortcuts and the undo key also work on YouTube Music, on songs.
        {:else}
          Playlist shortcuts are off.
          <button type="button" class="text-primary font-medium hover:underline" onclick={() => go("youtube")}>Turn them on in YouTube</button>
        {/if}
      </p>
    </div>
    <Switch
      class="mt-1"
      checked={f.shortcuts.on && f.shortcuts.onMusic}
      disabled={!f.shortcuts.on}
      aria-label="Playlist shortcuts on YouTube Music"
      onCheckedChange={(v) => act({ kind: "featureOption", id: "shortcuts", option: "onMusic", value: v })}
    />
  </div>
</div>
