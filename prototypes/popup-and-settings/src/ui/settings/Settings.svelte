<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 15). The settings page: "everything, for good" (ticket 09). It opens in a tab:
  // top bar (brand, account in view) › the popup's connection states as a strip › left nav › one section at a time.
  // The YouTube section loads with the page; every other section, and Diagnostics, loads when it's opened.
  import type { Component } from "svelte";
  import Tv from "@lucide/svelte/icons/tv";
  import Headphones from "@lucide/svelte/icons/headphones";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Users from "@lucide/svelte/icons/users";
  import Palette from "@lucide/svelte/icons/palette";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import Stethoscope from "@lucide/svelte/icons/stethoscope";
  import Info from "@lucide/svelte/icons/info";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
  import CircleCheck from "@lucide/svelte/icons/circle-check";
  import PigeonMark from "$ui/components/PigeonMark.svelte";
  import Lazy from "$ui/components/Lazy.svelte";
  import { Button } from "$ui/components/ui/button/index.js";
  import AccountInView from "./parts/AccountInView.svelte";
  import YouTubeSection from "./sections/YouTubeSection.svelte";
  import { banner as pickBanner, strip as pickStrip, type ActionId } from "$lib/notices";
  import { access, act, applyTheme, syncLine, ui } from "$lib/view.svelte";
  import { navigate, openExternal } from "$lib/nav";
  import { param } from "$lib/params";
  import { focusWhenReady, go, readHash, route, type SectionId } from "./route.svelte";
  import type { FeatureId } from "$shared/model/types";

  readHash();
  $effect(() => {
    const on = () => readHash();
    window.addEventListener("hashchange", on);
    window.addEventListener("popstate", on);
    return () => {
      window.removeEventListener("hashchange", on);
      window.removeEventListener("popstate", on);
    };
  });
  $effect(() => {
    if (route.focus) focusWhenReady(route.focus);
  });
  $effect(() => {
    void ui.s.theme;
    applyTheme(param("theme"));
  });

  const ytIds: FeatureId[] = ["autoAdd", "shortcuts", "quickSave", "queueButton", "watchButton", "cardMenu"];
  const unhealthy = (ids: FeatureId[]) => ids.some((id) => ui.s.features[id].on && (ui.s.health[id]?.status ?? "working") !== "working");
  const musicWanted = $derived(ui.s.musicSection && (ui.s.features.musicQuickActions.on || ui.s.features.musicShortcuts.on));

  const nav: { id: SectionId; label: string; icon: Component }[] = [
    { id: "youtube", label: "YouTube", icon: Tv },
    { id: "music", label: "YouTube Music", icon: Headphones },
    { id: "everywhere", label: "Everywhere", icon: RefreshCw },
    { id: "accounts", label: "Accounts", icon: Users },
    { id: "appearance", label: "Appearance", icon: Palette },
    { id: "privacy", label: "Privacy & data", icon: ShieldCheck },
    { id: "diagnostics", label: "Diagnostics", icon: Stethoscope },
    { id: "about", label: "About", icon: Info },
  ];

  /** A dot where something needs the user. */
  const dots = $derived<Partial<Record<SectionId, boolean>>>({
    youtube: unhealthy(ytIds) || Object.keys(ui.s.marks).length > 0 || !ui.s.env.access.youtube,
    music: unhealthy(["musicQuickActions", "musicShortcuts"]) || (musicWanted && !ui.s.env.access.music),
    everywhere: !!syncLine()?.problem,
    accounts: !!ui.s.unclaimed,
    privacy: ui.s.consent !== "accepted",
    diagnostics: unhealthy([...ytIds, "musicQuickActions", "musicShortcuts"]),
  });

  const sections: Record<Exclude<SectionId, "youtube">, () => Promise<{ default: Component }>> = {
    music: () => import("./sections/MusicSection.svelte"),
    everywhere: () => import("./sections/EverywhereSection.svelte"),
    accounts: () => import("./sections/AccountsSection.svelte"),
    appearance: () => import("./sections/AppearanceSection.svelte"),
    privacy: () => import("./sections/PrivacySection.svelte"),
    diagnostics: () => import("./sections/DiagnosticsSection.svelte"),
    about: () => import("./sections/AboutSection.svelte"),
  };

  // The popup's connection states, as one strip (ticket 09). The music access state shows in its own section.
  const notice = $derived(pickBanner("youtube"));
  const breakage = $derived(pickStrip("youtube") ?? pickStrip("music"));

  function run(id: ActionId) {
    const actions: Partial<Record<ActionId, () => void>> = {
      "review-onboarding": () => navigate("onboarding"),
      "dismiss-reset": () => act({ kind: "dismiss", notice: "remoteReset" }),
      "access-youtube": () => access.request("youtube"),
      "access-music": () => access.request("music"),
      "reload-tab": () => openExternal("reload"),
      "sign-in": () => openExternal("sign-in"),
      "open-youtube": () => openExternal("youtube"),
      "open-music": () => openExternal("music"),
      "sync-details": () => go("everywhere"),
      "show-marked": () => {
        location.hash = "#feature-autoAdd";
      },
      "switch-account": () => openExternal("switch-account"),
      "discard-unclaimed": () => act({ kind: "discardUnclaimed" }),
      "dismiss-claim": () => act({ kind: "dismiss", notice: "claim" }),
    };
    actions[id]?.();
  }

  // Refused changes (ticket 16's "full", ticket 11's private window) get one small toast.
  let toast = $state<null | { reason: string; at: number }>(null);
  $effect(() => {
    const r = ui.refused;
    if (!r) return;
    toast = r;
    const t = setTimeout(() => toast?.at === r.at && (toast = null), 7000);
    return () => clearTimeout(t);
  });
</script>

<div class="min-h-screen">
  <header class="brand-hairline bg-card relative z-30">
    <div class="mx-auto flex h-16 max-w-[1140px] items-center gap-3 px-6">
      <PigeonMark size={36} title="Playlist Pigeon" />
      <div class="leading-tight">
        <div class="text-[15px] font-semibold tracking-[-0.01em]">Playlist Pigeon</div>
        <div class="text-muted-foreground text-xs">Settings</div>
      </div>
      <div class="ml-auto"><AccountInView /></div>
    </div>
  </header>

  {#if notice || breakage}
    <div class="mx-auto max-w-[1140px] space-y-2 px-6 pt-5">
      {#if breakage}
        <div class="border-warning-border bg-warning-soft flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm" role="status">
          <TriangleAlert class="text-warning size-4 shrink-0" />
          <span class="min-w-0 flex-1">{breakage.text}</span>
          <Button size="sm" variant="outline" onclick={() => go("diagnostics")}>Details</Button>
        </div>
      {/if}
      {#if notice}
        <div
          class="flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm
            {notice.tone === 'attention' ? 'border-warning-border bg-warning-soft' : notice.tone === 'done' ? 'border-success/30 bg-success-soft' : 'bg-info-soft'}"
          role="status"
        >
          {#if notice.tone === "attention"}<TriangleAlert class="text-warning size-4 shrink-0" />
          {:else if notice.tone === "done"}<CircleCheck class="text-success size-4 shrink-0" />
          {:else}<Info class="text-info size-4 shrink-0" />{/if}
          <span class="min-w-0 flex-1">
            <span class="font-medium">{notice.title}</span>
            {#if notice.text}<span class="text-foreground/75"> {notice.text}</span>{/if}
          </span>
          {#each notice.actions as a (a.id)}
            <Button size="sm" variant={a.primary ? "default" : "outline"} onclick={() => run(a.id)}>{a.label}</Button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <div class="mx-auto flex max-w-[1140px] gap-10 px-6 pt-7 pb-24">
    <nav class="sticky top-6 w-[212px] shrink-0 self-start" aria-label="Settings sections">
      <ul class="space-y-0.5">
        {#each nav as n (n.id)}
          {@const active = route.section === n.id}
          <li>
            <a
              href="#{n.id}"
              class="flex h-9 items-center gap-3 rounded-lg px-3 text-[14px] transition-colors
                {active ? 'bg-accent text-accent-foreground font-medium' : 'text-foreground/75 hover:bg-muted hover:text-foreground'}"
              aria-current={active ? "page" : undefined}
              onclick={(e) => {
                e.preventDefault();
                go(n.id);
              }}
            >
              <n.icon class="size-4 shrink-0 {active ? 'text-primary' : 'text-muted-foreground'}" />
              <span class="flex-1">{n.label}</span>
              {#if dots[n.id]}<span class="bg-warning size-2 rounded-full" title="Needs your attention"></span>{/if}
            </a>
          </li>
        {/each}
      </ul>
      <div class="text-muted-foreground mt-6 border-t px-3 pt-4 text-xs leading-5">
        Changes save as you make them.
        <br />Off leaves nothing on YouTube's pages.
      </div>
    </nav>

    <main class="min-w-0 max-w-[780px] flex-1">
      {#key route.section}
        {#if route.section === "youtube"}
          <YouTubeSection />
        {:else}
          <Lazy load={sections[route.section]} />
        {/if}
      {/key}
    </main>
  </div>

  {#if ui.consentAsk}
    <Lazy load={() => import("./parts/ConsentDialog.svelte")} />
  {/if}

  {#if toast}
    <div
      class="bg-popover shadow-float animate-in fade-in-0 slide-in-from-bottom-2 fixed right-6 bottom-6 z-50 flex max-w-[420px] items-start gap-3 rounded-xl border px-4 py-3 text-sm"
      role="status"
    >
      <TriangleAlert class="text-warning mt-0.5 size-4 shrink-0" />
      <div class="min-w-0 flex-1">
        {#if toast.reason === "sync-full"}
          <p class="font-medium">Synced settings are full, so that change wasn't saved.</p>
          <p class="text-muted-foreground mt-0.5">{ui.s.sync.largest}: remove some, or turn off sync in this browser to keep more here.</p>
          <button type="button" class="text-primary mt-1.5 font-medium hover:underline" onclick={() => ((toast = null), go("everywhere"))}>Details</button>
        {:else if toast.reason === "private"}
          <p class="font-medium">Private window: account setups can be changed only in a normal window.</p>
          <p class="text-muted-foreground mt-0.5">Shared settings, like switches and keys, still save here.</p>
        {:else}
          <p class="font-medium">That change couldn't be saved.</p>
        {/if}
      </div>
    </div>
  {/if}
</div>
