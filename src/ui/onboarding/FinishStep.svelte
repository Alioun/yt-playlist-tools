<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import Button from "../components/Button.svelte"
  import Glyph from "../components/Glyph.svelte"
  import type { FirstRunText } from "./text"
  import type { FirstRunOwner, SetupRow } from "./owner"
  import { createSetup } from "./setup.svelte"

  let { owner, text }: { owner: FirstRunOwner; text: FirstRunText } = $props()

  const copy = $derived(text.copy.finish)
  const uid = $props.id()
  // svelte-ignore state_referenced_locally
  const setup = createSetup(owner)
  onMount(() => void setup.load())
  onDestroy(() => setup.dispose())

  const view = $derived(setup.view)
  const hasAccount = $derived(view.kind === "ready" && view.youtube.kind === "account")

  function selectionText(row: SetupRow): string {
    const selection = row.target?.selection
    if (!selection || selection.kind === "none") return row.target?.purpose === "auto-add" ? copy.noPlaylists : copy.noneChosen
    return selection.titles.join(", ")
  }

  function targetLead(row: SetupRow): string {
    switch (row.target?.purpose) {
      case "auto-add": return copy.autoAddLead
      case "shortcut": return copy.shortcutSaves(row.target.key)
      case "quick-save": return copy.quickSaves
      case "music-quick-save": return copy.musicSaves
      case undefined: return ""
    }
  }
</script>

<svelte:window onfocus={() => setup.load()} />
<svelte:document onvisibilitychange={() => { if (document.visibilityState === "visible") void setup.load() }} />

<section aria-labelledby="{uid}-heading">
  <h1 id="{uid}-heading" tabindex="-1" data-step-heading class="text-[30px] leading-tight font-semibold tracking-[-0.022em] outline-none">{copy.heading}</h1>

  {#if view.kind === "loading"}
    <div class="bg-card mt-7 flex items-center gap-3 rounded-xl border p-4" aria-busy="true" aria-label={copy.loading}>
      <span class="bg-muted size-9 rounded-full motion-safe:animate-pulse"></span>
      <span class="flex flex-col gap-2"><span class="bg-muted h-3 w-32 rounded-full motion-safe:animate-pulse"></span><span class="bg-muted h-2.5 w-20 rounded-full motion-safe:animate-pulse"></span></span>
    </div>
  {:else if view.kind === "unavailable"}
    <p role="alert" class="border-warning-border bg-warning-soft mt-7 flex items-start gap-2 rounded-xl border p-4 text-[13.5px]">
      <Glyph name="circle-alert" class="text-warning mt-0.5 size-4 shrink-0" />{copy.unavailable}
    </p>
  {:else}
    <p class="text-muted-foreground mt-2 text-[15px]">{view.rows.length ? copy.leadOn : copy.leadOff}</p>

    <div class="mt-7 grid gap-3">
      {#if view.youtube.kind === "no-access"}
        <div class="border-warning-border bg-warning-soft grid grid-cols-[auto_1fr] items-start gap-3 rounded-xl border p-4 sm:flex sm:items-center">
          <Glyph name="triangle-alert" class="text-warning size-5 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-[14.5px] font-semibold">{copy.noAccess}</p>
            <p class="text-foreground/75 text-[13.5px]">{copy.noAccessRest}</p>
          </div>
          <Button class="col-span-2 justify-self-start sm:shrink-0" onclick={() => setup.giveAccess("www")}>{copy.giveAccess}</Button>
        </div>
      {:else if view.youtube.kind === "no-tab"}
        <div class="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <span class="bg-info-soft text-info inline-flex size-9 shrink-0 items-center justify-center rounded-full"><Glyph name="external-link" class="size-[18px]" /></span>
          <div class="min-w-0 flex-1">
            <p class="text-[14.5px] font-semibold">{copy.noTab}</p>
            <p class="text-muted-foreground text-[13.5px]">{copy.noTabRest}</p>
          </div>
          <Button onclick={() => owner.open("youtube")}>{copy.openYouTube}</Button>
        </div>
      {:else if view.youtube.kind === "signed-out"}
        <div class="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <div class="min-w-0 flex-1">
            <p class="text-[14.5px] font-semibold">{copy.signedOut}</p>
            <p class="text-muted-foreground text-[13.5px]">{copy.signedOutRest}</p>
          </div>
          <Button onclick={() => owner.open("sign-in")}><Glyph name="log-in" />{copy.signIn}</Button>
        </div>
      {:else}
        <div class="bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4">
          <div class="min-w-0 flex-1">
            <p class="text-muted-foreground text-[12.5px]">{copy.accountLead}</p>
            <p class="text-[15px] leading-6 font-semibold">
              {view.youtube.account.name}
              {#if view.youtube.account.handle}<span class="text-muted-foreground font-normal">{view.youtube.account.handle}</span>{/if}
            </p>
          </div>
        </div>
      {/if}

      {#if view.musicAccess === "missing"}
        <div class="border-warning-border bg-warning-soft grid grid-cols-[auto_1fr] items-start gap-3 rounded-xl border p-4 sm:flex sm:items-center">
          <Glyph name="triangle-alert" class="text-warning size-5 shrink-0" />
          <div class="min-w-0 flex-1">
            <p class="text-[14.5px] font-semibold">{copy.noMusicAccess}</p>
            <p class="text-foreground/75 text-[13.5px]">{copy.noMusicAccessRest}</p>
          </div>
          <Button class="col-span-2 justify-self-start sm:shrink-0" onclick={() => setup.giveAccess("music")}>{copy.giveMusicAccess}</Button>
        </div>
      {/if}

      <div aria-live="polite">
        {#if setup.accessDenied}
          <p role="alert" class="text-warning flex items-center gap-2 text-[13px]"><Glyph name="circle-alert" class="size-4 shrink-0" />{copy.accessDenied}</p>
        {/if}
      </div>
    </div>

    {#if view.rows.length}
      <ul class="bg-card mt-4 divide-y rounded-xl border" aria-label={copy.heading}>
        {#each view.rows as row (row.feature)}
          {@const feature = text.features.featureOf(row.feature)}
          {@const choice = setup.choice(row.feature)}
          <li class="p-4" data-feature={row.feature}>
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p class="text-[15px] leading-[34px] font-semibold">{feature.name}</p>
              {#if row.held === "site-access"}
                <span class="text-warning inline-flex items-center gap-1.5 text-[13px] font-medium"><Glyph name="triangle-alert" class="size-4" />{copy.needsAccess}</span>
              {:else if row.held === "browser-menu-permission"}
                <span class="text-warning inline-flex items-center gap-1.5 text-[13px] font-medium"><Glyph name="triangle-alert" class="size-4" />{copy.needsBrowserMenu}</span>
              {:else if !row.target}
                <span class="text-success inline-flex items-center gap-1.5 text-[13px] font-medium">
                  <Glyph name="circle-check" class="size-4" />{row.feature === "gather" ? copy.gatherReady : copy.ready}
                </span>
              {:else if !hasAccount}
                <span class="text-muted-foreground text-[13px]">{copy.needsAccount}</span>
              {:else}
                <span class="flex min-w-0 flex-wrap items-center gap-2 text-[13px]">
                  <span class="text-muted-foreground">{targetLead(row)}</span>
                  {#if row.target.purpose !== "auto-add"}<span class="font-medium" data-selection>{selectionText(row)}</span>{/if}
                  <Button size="sm" variant="outline" pending={choice.kind === "pending"} aria-label={copy.chooseFor(feature.name)} onclick={() => setup.choose(row)}>
                    {copy.choose}
                  </Button>
                </span>
              {/if}
            </div>
            {#if row.alsoOnMusicHeld}
              <p class="text-warning mt-1 flex items-center gap-1.5 text-[13px]"><Glyph name="triangle-alert" class="size-4 shrink-0" />{copy.alsoOnMusicHeld}</p>
            {/if}
            {#if row.target?.purpose === "auto-add" && hasAccount && !row.held}
              <div class="mt-3 max-h-[340px] overflow-y-auto overscroll-contain rounded-lg border p-2" data-selection>
                {#if row.target.selection.kind === "chosen" && row.target.selection.titles.length}
                  <ul class="grid gap-1 text-[13.5px]">
                    {#each row.target.selection.titles as title, index (index)}<li class="px-2 py-1">{title}</li>{/each}
                  </ul>
                {:else}
                  <p class="text-muted-foreground px-2 py-1 text-[13.5px]">{copy.noPlaylists}</p>
                {/if}
              </div>
            {/if}
            <div aria-live="polite">
              {#if choice.kind === "pending"}
                <p class="text-muted-foreground mt-1 text-[13px]">{copy.choosing}</p>
              {:else if choice.kind === "failed"}
                <p role="alert" class="text-warning mt-1 flex items-center gap-1.5 text-[13px]">
                  <Glyph name="circle-alert" class="size-4 shrink-0" />{copy.choiceFailed[choice.reason]}
                </p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}

  <div class="mt-8 flex flex-wrap items-center gap-3">
    <Button size="lg" onclick={() => owner.open("youtube")}>{copy.openYouTube}<Glyph name="external-link" /></Button>
    <Button variant="outline" size="lg" onclick={() => owner.open("settings")}><Glyph name="settings" />{copy.openSettings}</Button>
  </div>
</section>
