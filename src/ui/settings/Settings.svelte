<script lang="ts">
  import clsx from "clsx"
  import { onDestroy, tick, untrack } from "svelte"
  import Mark from "../components/Mark.svelte"
  import type { BannerAction } from "../components/BannerCard.svelte"
  import { createFeatureCopy } from "../onboarding/features"
  import type { ExtensionPage } from "../shell/start"
  import { PageState } from "../lib/page-state.svelte"
  import { banners, type Banner } from "../lib/notices"
  import { needsAccess } from "../lib/held"
  import { relativeTime } from "../lib/time"
  import { parseRoute, sections, type Route, type Section } from "./route"

  let { page, markSrc }: { page: ExtensionPage; markSrc: string } = $props()
  const pageState = new PageState(untrack(() => page))
  const { i18n } = untrack(() => page)
  const features = createFeatureCopy(i18n)
  let route = $state<Route>(parseRoute(location.hash))
  const onhash = () => { route = parseRoute(location.hash) }
  addEventListener("hashchange", onhash)
  onDestroy(() => { removeEventListener("hashchange", onhash); pageState.dispose() })

  const view = $derived(pageState.ready)
  const settings = $derived(pageState.settings)
  const strip = $derived(view ? banners({ view, sites: ["www", "music"], tab: null, account: pageState.account, access: pageState.access, private: pageState.private }) : [])
  const health = $derived(pageState.status?.kind === "status" ? pageState.status.health : [])
  const dots = $derived.by((): Partial<Record<Section, boolean>> => {
    const access = pageState.access
    const broken = (site: "www" | "music") => health.some(row => row.site === site && row.state !== "working")
    const marks = view?.setups.some(entry => Object.keys(entry.setup.marks).length > 0) ?? false
    const status = view?.sync?.status
    return {
      youtube: broken("www") || marks || !!settings && !!access && !access.www && needsAccess("www", settings),
      music: broken("music") || !!settings && !!access && !access.music && needsAccess("music", settings),
      everywhere: status === "full" || status === "update-needed" || status === "waiting",
      accounts: view?.unclaimed !== null && view?.unclaimed !== undefined,
      privacy: !pageState.agreed,
      diagnostics: health.some(row => row.state !== "working")
    }
  })
  const names = { youtube: "set_nav_youtube", music: "set_nav_music", everywhere: "set_nav_everywhere", accounts: "set_nav_accounts",
    appearance: "set_nav_appearance", privacy: "set_nav_privacy", diagnostics: "set_nav_diagnostics", about: "set_nav_about" } as const satisfies Record<Section, string>
  const loaders = {
    youtube: () => import("./sections/YouTube.svelte"), music: () => import("./sections/Music.svelte"), everywhere: () => import("./sections/Everywhere.svelte"),
    accounts: () => import("./sections/Accounts.svelte"), appearance: () => import("./sections/Appearance.svelte"), privacy: () => import("./sections/Privacy.svelte"),
    diagnostics: () => import("./sections/Diagnostics.svelte"), about: () => import("./sections/About.svelte")
  } satisfies Record<Section, () => Promise<unknown>>

  const section = $derived(route.section)
  const loading = $derived(loaders[section]())
  // A feature link scrolls to its card and rings it for 1.8 s; a playlist link highlights that row too (UI-SET-05).
  async function ring(current: Route) {
    if (!current.feature) return
    for (let attempt = 0; attempt < 20; attempt++) {
      await tick()
      const card = document.querySelector<HTMLElement>(`[data-feature-card="${current.feature}"]`)
      if (card) {
        card.scrollIntoView({ block: "start" })
        card.dataset.ring = ""
        const row = current.playlist ? card.querySelector<HTMLElement>(`[data-autoadd-row="${CSS.escape(current.playlist)}"]`) : null
        if (row) { row.dataset.highlight = ""; row.scrollIntoView({ block: "center" }) }
        setTimeout(() => { delete card.dataset.ring; if (row) delete row.dataset.highlight }, 1800)
        return
      }
      await new Promise(resolve => setTimeout(resolve, 50))
    }
  }
  $effect(() => { const current = route; void untrack(() => ring(current)) })
  function act(action: BannerAction, banner: Banner) {
    switch (action) {
      case "review": page.openFirstRun(); break
      case "give-access": if (banner.kind === "access") void page.backend.access.request(banner.site).then(() => pageState.refreshAccess()); break
      case "sign-in": page.open("https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F"); break
      case "open-youtube": page.open("https://www.youtube.com/"); break
      case "details": location.hash = "#everywhere"; break
      case "show": location.hash = "#feature-auto-add"; break
      case "switch-account": page.open("https://www.youtube.com/channel_switcher"); break
    }
  }
</script>

<div class="bg-background text-foreground min-h-screen" data-settings>
  <header class="bg-card/80 sticky top-0 z-10 flex h-16 items-center gap-3 border-b px-6 backdrop-blur">
    <Mark src={markSrc} size={30} />
    <span class="text-[17px] font-semibold">{i18n.message("extShortName")}</span>
    <span class="text-muted-foreground text-[15px]">{i18n.message("set_title")}</span>
    {#if pageState.agreed && pageState.acct}
      <span class="text-muted-foreground ml-auto text-[13.5px]">{i18n.message("set_shownFor", { account: pageState.accountName() })}</span>
    {/if}
  </header>
  {#if strip.length}
    <div class="mx-auto flex max-w-5xl flex-col gap-2 px-6 pt-4" data-strip>
      {#await import("../components/BannerCard.svelte") then { default: Card }}
        {#each strip as banner (banner.kind + ("site" in banner ? banner.site : ""))}
          <Card {banner} {i18n} account={pageState.accountName()} when={at => relativeTime(i18n, at)} onaction={act} />
        {/each}
      {/await}
    </div>
  {/if}
  <div class="mx-auto flex max-w-5xl gap-8 px-6 py-6">
    <nav aria-label={i18n.message("set_navLabel")} class="sticky top-24 h-max w-48 shrink-0">
      <ul class="flex flex-col gap-0.5">
        {#each sections as section (section)}
          <li>
            <a href="#{section}" aria-current={route.section === section ? "page" : undefined}
              class={clsx("flex min-h-9 items-center justify-between rounded-lg px-3 text-[14px]", route.section === section ? "bg-accent text-accent-foreground font-medium" : "hover:bg-muted")}>
              {i18n.message(names[section])}
              {#if dots[section]}<span class="bg-warning size-2 rounded-full" aria-label={i18n.message("set_needsYou")} role="img"></span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    </nav>
    <main class="min-w-0 flex-1" aria-label={i18n.message(names[route.section])}>
      {#if pageState.view?.kind === "unavailable"}
        <p class="text-muted-foreground">{i18n.message("shell_unavailable")}</p>
      {:else if view}
        {#await loading then module}
          <module.default {pageState} {features} {route} />
        {/await}
      {/if}
    </main>
  </div>
</div>

<style>
  :global([data-feature-card][data-ring]) { box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 55%, transparent); }
  :global([data-autoadd-row][data-highlight]) { background: color-mix(in oklch, var(--brand-violet) 10%, transparent); }
</style>
