<script lang="ts">
  import "../settings-more.css";
  // Settings › Accounts (ticket 11): every account setup, with Remove; the unclaimed 1.x setup; links to YouTube's
  // own sign-in and account switcher. Showing a setup here only changes what settings shows (account in view).
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Eye from "@lucide/svelte/icons/eye";
  import Archive from "@lucide/svelte/icons/archive";
  import { Button } from "$ui/components/ui/button/index.js";
  import Avatar from "$ui/components/Avatar.svelte";
  import Callout from "../parts/Callout.svelte";
  import SectionHeader from "../parts/SectionHeader.svelte";
  import SettingsDialog from "../parts/SettingsDialog.svelte";
  import { accountInView, accountsWithSetup, act, labelOf, setupOf, titleOf, ui } from "$lib/view.svelte";
  import { openExternal } from "$lib/nav";
  import { go } from "../route.svelte";
  import type { AccountId } from "$shared/model/types";

  const accounts = $derived(accountsWithSetup());
  const tabAcct = $derived(ui.account.state === "ready" ? ui.account.acct : null);
  const inView = $derived(accountInView());
  const priv = $derived(ui.s.env.privateWindow);
  let removing = $state<AccountId | null>(null);
  let open = $state(false);

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  function summary(a: AccountId): string {
    const s = setupOf(a)!;
    const name = labelOf(a).name;
    if (s.notLoadedHere) return `${plural(s.autoAdd.length, "auto-add playlist")} · Open YouTube as ${name} to see them`;
    const parts = [plural(s.autoAdd.length, "auto-add playlist")];
    const shortcutCount = Object.keys(s.shortcutTargets).length;
    if (shortcutCount) parts.push(plural(shortcutCount, "shortcut playlist"));
    if (s.quickSave) parts.push(`quick-save: ${titleOf(s.quickSave)}`);
    if (s.musicQuickSave) parts.push(`YouTube Music: ${titleOf(s.musicQuickSave)}`);
    const filters = Object.values(s.filters).filter((f) => f.on).length;
    if (filters) parts.push(plural(filters, "channel filter"));
    return parts.join(" · ");
  }
  function show(a: AccountId) {
    ui.picked = a === tabAcct ? null : a;
    go("youtube");
  }
</script>

<SectionHeader
  title="Accounts"
  description="Each YouTube account keeps its own setup: the choices that name its playlists, such as its auto-add playlists and their channel filters, each shortcut's playlist and its quick-save playlists. Everything else is shared by every account."
/>

<div class="space-y-4">
  {#if priv}
    <Callout>Private window: setups are in use here but can be changed or removed only in a normal window.</Callout>
  {/if}

  <section class="bg-card shadow-soft overflow-hidden rounded-2xl border">
    <div class="flex items-center justify-between gap-3 border-b px-5 py-3">
      <h3 class="text-[15px] font-semibold">Account setups in this browser</h3>
      <span class="text-muted-foreground text-xs">{accounts.length}</span>
    </div>
    {#if accounts.length}
      <ul class="divide-y">
        {#each accounts as a (a)}
          {@const l = labelOf(a)}
          <li class="flex items-center gap-4 px-5 py-4">
            <Avatar label={l} size={40} />
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-[15px] font-medium">{l.name}</span>
                <span class="text-muted-foreground text-[13px]">{l.handle ?? "No channel"}</span>
                {#if l.brand}<span class="bg-muted text-muted-foreground rounded-full px-2 py-px text-[11px] font-medium">Brand account</span>{/if}
                {#if a === tabAcct}<span class="bg-success-soft text-success rounded-full px-2 py-px text-[11px] font-medium">This tab</span>{/if}
                {#if a === inView && a !== tabAcct}<span class="bg-accent text-accent-foreground rounded-full px-2 py-px text-[11px] font-medium">Shown in settings</span>{/if}
              </div>
              <p class="text-muted-foreground mt-0.5 line-clamp-2 text-[13px] leading-5">{summary(a)}</p>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              {#if a !== inView}
                <Button size="sm" variant="ghost" onclick={() => show(a)}><Eye />Show its setup</Button>
              {/if}
              <Button
                size="sm"
                variant="outline"
                disabled={priv}
                onclick={() => {
                  removing = a;
                  open = true;
                }}>Remove</Button
              >
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="text-muted-foreground px-5 py-6 text-sm">
        No account has a setup yet. An account gets one with its first choice, such as ticking an auto-add playlist in the popup.
      </p>
    {/if}
  </section>

  {#if ui.s.unclaimed}
    {@const u = ui.s.unclaimed}
    <section class="bg-card shadow-soft rounded-2xl border px-5 py-4">
      <div class="flex items-start gap-4">
        <span class="bg-muted text-muted-foreground inline-flex size-10 shrink-0 items-center justify-center rounded-full"><Archive class="size-5" /></span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-[15px] font-medium">Your setup from 1.x</h3>
            <span class="bg-warning-soft text-warning rounded-full px-2 py-px text-[11px] font-medium">Not claimed yet</span>
          </div>
          <p class="text-muted-foreground mt-0.5 text-[13px] leading-5">
            {plural(u.autoAdd.length, "auto-add playlist")}{u.shortcutTarget ? " and a shortcut playlist" : ""}. They belong to a YouTube account that isn't
            open here. Switch to it on YouTube and it's picked up; it's never used until then, and it stays in this browser.
          </p>
          <div class="mt-3 flex gap-2">
            <Button size="sm" onclick={() => openExternal("switch-account")}>Switch account on YouTube <ExternalLink /></Button>
            <Button size="sm" variant="outline" onclick={() => act({ kind: "discardUnclaimed" })}>Discard</Button>
          </div>
        </div>
      </div>
    </section>
  {/if}

  <section class="bg-muted/40 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-dashed px-5 py-4 text-[13.5px]">
    <p class="text-muted-foreground min-w-0 flex-1 leading-5">
      Switching accounts happens on YouTube. Playlist Pigeon follows each tab's account and never changes it.
    </p>
    <Button size="sm" variant="outline" onclick={() => openExternal("sign-in")}>Sign in <ExternalLink /></Button>
    <Button size="sm" variant="outline" onclick={() => openExternal("switch-account")}>Switch account <ExternalLink /></Button>
  </section>
</div>

<SettingsDialog
  bind:open
  title="Remove {removing ? labelOf(removing).name : ''}'s setup?"
  width="md"
  onclose={() => (removing = null)}
>
  <p class="text-foreground/80 text-sm leading-6">
    Its auto-add playlists, channel filters and shortcut playlists are deleted from {ui.s.sync.on ? "every browser that syncs your settings" : "this browser"}.
    Your playlists on YouTube aren't touched.
  </p>
  {#snippet footer()}
    <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
    <Button
      variant="destructive"
      onclick={() => {
        if (removing) act({ kind: "removeSetup", acct: removing });
        open = false;
      }}>Remove</Button
    >
  {/snippet}
</SettingsDialog>
