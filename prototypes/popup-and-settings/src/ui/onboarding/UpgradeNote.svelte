<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 15). The one-time 1.4.5 upgrade note, ticket 19 §3's copy, and the upgraders' consent.
  // It opens once, in a background tab. Before Agree nothing is read from YouTube (ticket 19 §2.4), so it shows only
  // what the migration stored: "{N} playlists you chose in 1.x", the real percentage (or §2.3's one question), the key.
  // Titles, the account and signed-in state appear only in the outcome after Agree, in place.
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import KeyRound from "@lucide/svelte/icons/key-round";
  import Tag from "@lucide/svelte/icons/tag";
  import Pause from "@lucide/svelte/icons/pause";
  import Check from "@lucide/svelte/icons/check";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import LoaderCircle from "@lucide/svelte/icons/loader-circle";
  import Settings from "@lucide/svelte/icons/settings";
  import Info from "@lucide/svelte/icons/info";
  import { Button } from "$ui/components/ui/button/index.js";
  import PigeonMark from "$ui/components/PigeonMark.svelte";
  import Disclosure from "$ui/components/Disclosure.svelte";
  import KeyCombo from "$ui/components/KeyCombo.svelte";
  import FeaturePick from "./FeaturePick.svelte";
  import { features } from "$shared/features/registry";
  import type { FeatureId, UpgradeDetails } from "$shared/model/types";
  import type { UiResult } from "$ui/backend/backend";
  import { access, act, call, isMusic, labelOf, listOf, ui } from "$lib/view.svelte";
  import { navigate, openExternal } from "$lib/nav";

  // `?mode=upgrade` on a scenario without stored details shows 1.4.5's commonest case.
  const d: UpgradeDetails = ui.s.upgradeDetails ?? {
    from: "1.4.5",
    autoAdd: { kept: 3, dropped: 1 },
    pct: { value: 0, wasUnset: true },
    feedback: false,
    shortcut: { raw: "Control+S", key: "Ctrl+S", playlist: true, note: "ctrl-never-fired" },
    credentialsDeleted: true,
  };
  const sc = d.shortcut;
  const os = $derived(ui.s.env.os);

  // Ticked per §3: auto-add when playlists came over; shortcuts only when the key works ("ok" or "ctrl-never-fired").
  let keepAuto = $state(d.autoAdd.kept > 0);
  let keepKeys = $state(sc.note === "ok" || sc.note === "ctrl-never-fired");
  let pctChoice = $state<"start" | "half">("start");
  const NEW: (FeatureId | "sync")[] = ["quickSave", "queueButton", "watchButton", "cardMenu", "musicQuickActions", "musicShortcuts", "sync"];
  let picked = $state<(FeatureId | "sync")[]>([]);
  let phase = $state<"review" | "agreeing" | "done" | "notnow">("review");
  let outcome = $state<UiResult<"claim"> | null>(null);

  const n = $derived((keepAuto ? 1 : 0) + (keepKeys ? 1 : 0) + picked.length);
  const agreeLabel = $derived(n ? `Agree and turn on ${n} feature${n === 1 ? "" : "s"}` : "Agree");
  const bare = $derived(!!sc.key && !/(Ctrl|Alt|Meta)\+/.test(sc.key));
  const presets = $derived(!!ui.s.features.shortcuts.pickerKey && !!ui.s.undoKey);
  const groups: { label: string; ids: (FeatureId | "sync")[] }[] = [
    { label: "On YouTube", ids: NEW.filter((id) => id !== "sync" && features.find((f) => f.id === id)?.site === "youtube") },
    { label: "On YouTube Music", ids: NEW.filter((id) => id !== "sync" && features.find((f) => f.id === id)?.site === "music") },
    { label: "Everywhere", ids: ["sync"] },
  ];

  function set(id: FeatureId | "sync", on: boolean) {
    picked = on ? [...picked, id] : picked.filter((x) => x !== id);
  }

  async function agree() {
    const newOnes = picked.filter((x): x is FeatureId => x !== "sync");
    // Chrome: the YouTube Music permission is the first thing this click does (ticket 10).
    if (ui.s.env.browser === "chrome" && !ui.s.env.access.music && newOnes.some(isMusic)) await access.request("music");
    phase = "agreeing";
    if (keepAuto && d.pct.wasUnset && pctChoice === "half") await act({ kind: "featureOption", id: "autoAdd", option: "percent", value: 50 });
    if (!keepAuto) await act({ kind: "feature", id: "autoAdd", on: false });
    if (!keepKeys) await act({ kind: "feature", id: "shortcuts", on: false });
    const turnOn: FeatureId[] = [...(keepAuto ? (["autoAdd"] as const) : []), ...(keepKeys ? (["shortcuts"] as const) : []), ...newOnes];
    await act({ kind: "consent", accepted: true, turnOn });
    if (picked.includes("sync")) await act({ kind: "sync", on: true });
    // Only now may anything be read from YouTube: claim the 1.x playlists for the account that owns them (ticket 11).
    outcome = await call("claim", {});
    phase = "done";
    queueMicrotask(() => document.getElementById("outcome")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
</script>

<div class="mx-auto max-w-[700px] px-6 pt-12 pb-16">
  <header>
    <div class="text-muted-foreground flex items-center gap-2.5 text-[13px] font-medium">
      <PigeonMark size={30} />
      <span>Playlist Pigeon 2.0</span>
      <span class="text-muted-foreground/50">·</span>
      <span>updated from {d.from}</span>
    </div>
    <h1 class="mt-5 text-[32px] leading-[1.15] font-semibold tracking-[-0.025em]">YouTube Playlist Tools is now Playlist Pigeon</h1>
  </header>

  <!-- What changed: credentials and the name. -->
  <div class="bg-card shadow-soft mt-7 divide-y rounded-2xl border">
    <div class="flex gap-4 p-5">
      <span class="bg-success-soft text-success inline-flex size-9 shrink-0 items-center justify-center rounded-full" aria-hidden="true"><KeyRound class="size-[18px]" /></span>
      <div class="min-w-0 text-[14.5px] leading-relaxed">
        <p>
          <strong class="font-semibold">2.0 needs no Google credentials anymore.</strong> It works through the YouTube account
          you're signed in to in this browser, the way YouTube's own buttons do. The client ID, client secret and sign-in tokens
          you set up for 1.x have been deleted from this browser.
        </p>
        <p class="text-muted-foreground mt-2 text-[13.5px]">
          <button type="button" class="text-primary inline-flex items-center gap-1 font-medium hover:underline" onclick={() => openExternal("google-permissions")}
            >Remove 1.x's access from your Google account <ExternalLink class="size-3.5" /></button
          >
          · If you made a Google Cloud project just for 1.x, you can delete that too.
        </p>
      </div>
    </div>
    <div class="flex gap-4 p-5">
      <span class="bg-accent text-primary inline-flex size-9 shrink-0 items-center justify-center rounded-full" aria-hidden="true"><Tag class="size-[18px]" /></span>
      <p class="min-w-0 text-[14.5px] leading-relaxed">
        <strong class="font-semibold">Why the new name:</strong> Google's rules don't allow extensions to be named after YouTube,
        so YouTube Playlist Tools is now Playlist Pigeon for YouTube™. It's the same add-on, and your settings came along.
      </p>
    </div>
  </div>

  {#if !ui.s.env.access.youtube}
    <!-- A local check, so it may show before Agree (ticket 19 §2.4). -->
    <div class="border-warning-border bg-warning-soft mt-6 flex flex-wrap items-center gap-3 rounded-xl border p-4">
      <TriangleAlert class="text-warning size-5 shrink-0" />
      <p class="min-w-0 flex-1 text-[14px]">
        Playlist Pigeon doesn't have access to YouTube in this browser, so nothing can run there yet.
      </p>
      <Button onclick={() => access.request("youtube")}>Give access to YouTube</Button>
    </div>
  {/if}

  <!-- Kept from 1.4.5: ticked, paused until Agree. -->
  <section class="mt-10">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h2 class="text-[19px] font-semibold tracking-[-0.01em]">Kept from {d.from}</h2>
      {#if phase === "done"}
        <span class="bg-success-soft text-success inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"><Check class="size-3.5" />On</span>
      {:else}
        <span class="bg-warning-soft text-warning inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold"
          ><Pause class="size-3" />Paused until you agree below</span
        >
      {/if}
    </div>

    <div class="mt-4 grid gap-3">
      {#if d.autoAdd.kept > 0}
        <FeaturePick id="autoAdd" checked={keepAuto} onchange={(v) => (keepAuto = v)}>
          <ul class="note-list text-foreground/85 space-y-1.5 text-[13.5px] leading-[1.5]">
            <li>
              Adds to <strong class="font-semibold">{d.autoAdd.kept} playlist{d.autoAdd.kept === 1 ? "" : "s"}</strong> you chose in 1.x.
              {#if d.autoAdd.dropped > 0}
                <span class="text-muted-foreground">{d.autoAdd.dropped} {d.autoAdd.dropped === 1 ? "entry wasn't a playlist ID and was" : "entries weren't playlist IDs and were"} left out.</span>
              {/if}
            </li>
            {#if !d.pct.wasUnset}
              <li>Adds a video once you've watched <strong class="font-semibold">{d.pct.value} %</strong> of it.</li>
            {/if}
            <li>Auto-add now counts only what you actually watch. Skipping ahead and ads don't count.</li>
            <li>It never adds a video twice, and it tells you when an add fails.</li>
            <li>
              {d.feedback ? "Confirmations stay on, as in 1.x." : "Confirmations stay off, as in 1.x. Failures now always show."}
            </li>
            <li>Your playlists take videos, not Shorts. You can add Shorts per playlist in Settings.</li>
          </ul>
          {#if d.pct.wasUnset}
            <!-- Ticket 19 §2.3: the one question, only where 1.4.5 showed one thing and did another. -->
            <fieldset class="bg-muted/50 mt-3.5 rounded-xl border p-3.5" disabled={phase === "done"}>
              <legend class="sr-only">When should auto-add add a video?</legend>
              <p class="text-[13.5px] leading-[1.5] font-medium">
                1.4.5 showed 50 % here, but it was actually adding videos as soon as they started playing. Which do you want?
              </p>
              <div class="mt-2.5 grid gap-1.5">
                {#each [{ v: "start", t: "As soon as a video starts playing, like 1.4.5 did" }, { v: "half", t: "Once half of it is watched, as 1.4.5 showed" }] as o (o.v)}
                  <label
                    class="hover:bg-card has-[:checked]:bg-card has-[:checked]:border-primary/50 flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-[13.5px]"
                  >
                    <input type="radio" name="pct" value={o.v} class="peer sr-only" checked={pctChoice === o.v} onchange={() => (pctChoice = o.v as "start" | "half")} />
                    <span
                      class="peer-focus-visible:ring-ring/40 inline-flex size-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] peer-focus-visible:ring-3
                        {pctChoice === o.v ? 'border-primary' : 'border-input bg-background'}"
                      aria-hidden="true"
                    >
                      {#if pctChoice === o.v}<span class="bg-primary size-2 rounded-full"></span>{/if}
                    </span>
                    {o.t}
                  </label>
                {/each}
              </div>
            </fieldset>
          {/if}
        </FeaturePick>
      {/if}

      {#if sc.note !== "none"}
        <FeaturePick id="shortcuts" checked={keepKeys} blurb="Keys that save the video you're pointing at or watching." onchange={(v) => (keepKeys = v)}>
          <ul class="note-list text-foreground/85 space-y-1.5 text-[13.5px] leading-[1.5]">
            {#if sc.note === "unconvertible"}
              <li>Your 1.x key (<code class="bg-muted rounded px-1 py-0.5 font-mono text-[12.5px]">{sc.raw}</code>) can't be used in 2.0. Set a new one in Settings.</li>
            {:else if sc.note === "no-playlist" && sc.key}
              <li class="flex flex-wrap items-center gap-1.5">Your 1.x key <KeyCombo key={sc.key} {os} /> had no playlist. Choose one after you agree.</li>
            {:else if sc.key}
              <li class="flex flex-wrap items-center gap-1.5">
                <KeyCombo key={sc.key} {os} /> saves the video you're watching, or pointing at, to the playlist you chose in 1.x.
              </li>
              {#if sc.note === "ctrl-never-fired"}
                <li class="flex flex-wrap items-center gap-1.5"><KeyCombo key={sc.key} {os} size="xs" /> never worked in 1.4.5 because of a bug. It works now.</li>
              {/if}
              {#if bare}<li>It no longer fires while you type in a search box or a comment.</li>{/if}
              {#if sc.clash}
                <li class="text-warning flex items-start gap-1.5"><Info class="mt-[3px] size-3.5 shrink-0" />{sc.clash}</li>
              {/if}
            {/if}
            {#if presets}
              <li class="flex flex-wrap items-center gap-1.5">
                Also new: <KeyCombo key={ui.s.features.shortcuts.pickerKey} {os} size="xs" /> opens a playlist picker, and
                <KeyCombo key={ui.s.undoKey} {os} size="xs" /> undoes the last save.
              </li>
            {/if}
          </ul>
        </FeaturePick>
      {/if}
    </div>
  </section>

  <!-- New in 2.0: every other feature, unticked. -->
  <section class="mt-10">
    <h2 class="text-[19px] font-semibold tracking-[-0.01em]">New in 2.0</h2>
    <p class="text-muted-foreground mt-1 text-[14.5px]">All off. Tick any you want, or switch them on later in Settings.</p>
    {#each groups as g (g.label)}
      <h3 class="text-muted-foreground mt-6 mb-2.5 text-xs font-semibold tracking-[0.08em] uppercase">{g.label}</h3>
      <div class="grid gap-2.5">
        {#each g.ids as id (id)}
          <FeaturePick {id} checked={picked.includes(id)} onchange={(v) => set(id, v)} />
        {/each}
      </div>
    {/each}
    {#if ui.s.env.browser === "chrome" && !ui.s.env.access.music && picked.some((x) => x !== "sync" && isMusic(x))}
      <p class="text-muted-foreground mt-3 flex items-center gap-2 text-[13px]">
        <Info class="size-4 shrink-0" />Chrome will ask for access to music.youtube.com when you agree.
      </p>
    {/if}
  </section>

  <!-- Before you continue: it comes last because Agree applies the ticks. -->
  <section class="mt-10">
    <h2 class="text-[19px] font-semibold tracking-[-0.01em]">Before you continue</h2>
    <div class="bg-card shadow-soft mt-4 rounded-2xl border p-6">
      <Disclosure browser={ui.s.env.browser} />
    </div>

    {#if phase === "done" && outcome}
      <div id="outcome" class="border-success/35 bg-card shadow-soft mt-6 rounded-2xl border p-6" role="status">
        <div class="flex items-center gap-3">
          <span class="bg-success inline-flex size-9 items-center justify-center rounded-full text-white dark:text-background" aria-hidden="true"
            ><Check class="size-5" strokeWidth={3} /></span
          >
          <p class="text-[20px] font-semibold tracking-[-0.015em]">You're all set.</p>
        </div>
        <div class="mt-3 pl-12 text-[14.5px] leading-relaxed">
          {#if outcome.outcome === "claimed"}
            <p>
              Your auto-add playlists and shortcut from 1.x are now set up for <strong class="font-semibold">{labelOf(outcome.acct).name}</strong>:
              {listOf(outcome.titles)}.
            </p>
            {#if outcome.leftOut > 0}
              <p class="text-muted-foreground mt-1">{outcome.leftOut} of them {outcome.leftOut === 1 ? "wasn't" : "weren't"} on this account and {outcome.leftOut === 1 ? "was" : "were"} left out.</p>
            {/if}
          {:else if outcome.outcome === "sign-in"}
            <p>Sign in to YouTube and your 1.x playlists will be picked up.</p>
          {:else if outcome.outcome === "open-youtube"}
            <p>Open YouTube and your 1.x playlists will be picked up.</p>
          {:else if outcome.outcome === "other-account"}
            <p>Your playlists from 1.x belong to another YouTube account. Switch to it on YouTube to use them.</p>
          {:else}
            <p>Your features are on.</p>
          {/if}
        </div>
        <div class="mt-5 flex flex-wrap gap-3 pl-12">
          {#if outcome.outcome === "other-account"}
            <Button size="lg" onclick={() => openExternal("switch-account")}>Switch account<ExternalLink /></Button>
          {:else if outcome.outcome === "sign-in"}
            <Button size="lg" onclick={() => openExternal("sign-in")}>Sign in to YouTube<ExternalLink /></Button>
          {:else}
            <Button size="lg" onclick={() => openExternal("youtube")}>Open YouTube<ExternalLink /></Button>
          {/if}
          <Button variant="outline" size="lg" onclick={() => navigate("settings")}><Settings />Open Settings</Button>
        </div>
      </div>
    {:else if phase === "notnow"}
      <div class="bg-card mt-6 flex flex-wrap items-center gap-4 rounded-2xl border p-5" role="status">
        <span class="bg-warning-soft text-warning inline-flex size-9 shrink-0 items-center justify-center rounded-full" aria-hidden="true"><Pause class="size-[18px]" /></span>
        <p class="min-w-0 flex-1 text-[14.5px] leading-relaxed">
          <strong class="font-semibold">Everything stays paused.</strong> The toolbar icon keeps a ! until you decide.
        </p>
        <Button variant="brand" size="lg" onclick={agree}>{agreeLabel}</Button>
      </div>
    {:else}
      <div class="mt-6 flex flex-wrap items-center gap-3">
        <Button variant="brand" size="lg" disabled={phase === "agreeing"} onclick={agree}>
          {#if phase === "agreeing"}<LoaderCircle class="animate-spin" />{/if}{agreeLabel}
        </Button>
        <Button variant="outline" size="lg" disabled={phase === "agreeing"} onclick={() => (phase = "notnow")}>Not now</Button>
      </div>
      {#if phase === "agreeing"}
        <p class="text-muted-foreground mt-3 flex items-center gap-2 text-[13px]" aria-live="polite">
          <CircleCheck class="text-success size-4" />Agreed. Looking for the account that owns your 1.x playlists…
        </p>
      {/if}
    {/if}
  </section>
</div>
