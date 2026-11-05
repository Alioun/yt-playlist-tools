<script lang="ts">
  import { onMount, tick, untrack } from "svelte"
  import Glyph from "../components/Glyph.svelte"
  import type { AccountKey } from "../../shared/model/validation"
  import type { PageState } from "../lib/page-state.svelte"

  // The header's account menu (UI-POP-07, ACC-15): which setup the popup shows, never which account YouTube uses.
  // YouTube's own account switch and sign-in are links, because they're YouTube's job (PAR-CAP-55).
  let { pageState, onclose, onmanage, onopen }: {
    pageState: PageState
    onclose: (restoreFocus: boolean) => void
    onmanage: () => void
    onopen: (url: string) => void
  } = $props()
  const { i18n } = untrack(() => pageState.page)
  const signIn = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F"
  let menu: HTMLDivElement | undefined = $state()
  const setups = $derived(pageState.ready?.setups ?? [])

  function items(): HTMLElement[] { return [...menu?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? []] }
  onMount(() => {
    void tick().then(() => { (items().find(item => item.getAttribute("aria-checked") === "true") ?? items()[0])?.focus() })
    const outside = (event: PointerEvent) => { if (menu && !menu.contains(event.target as Node)) onclose(false) }
    document.addEventListener("pointerdown", outside, true)
    return () => document.removeEventListener("pointerdown", outside, true)
  })
  function keydown(event: KeyboardEvent) {
    const all = items(), at = all.indexOf(document.activeElement as HTMLElement)
    const move = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[event.key]
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); event.stopPropagation(); onclose(true); return }
    if (move === undefined) return
    event.preventDefault()
    all[(move + all.length) % all.length]?.focus()
  }
  function show(acct: AccountKey) {
    pageState.chosen = acct === pageState.tabAccount ? null : acct
    onclose(true)
  }
</script>

<div bind:this={menu} role="menu" tabindex="-1" aria-labelledby="account-menu-heading" onkeydown={keydown}
  class="bg-card text-card-foreground absolute top-[52px] right-3 left-12 z-30 flex flex-col rounded-xl border p-1.5 text-[13px] shadow-lg" data-account-menu>
  <p id="account-menu-heading" class="text-muted-foreground px-2 pt-1 pb-1.5 text-[11.5px] font-semibold tracking-wide uppercase">{i18n.message("pop_showSetupFor")}</p>
  {#each setups as entry (entry.acct)}
    {@const checked = entry.acct === pageState.acct}
    <button type="button" role="menuitemradio" aria-checked={checked} class="hover:bg-muted focus-visible:bg-muted flex min-h-9 items-center gap-2 rounded-lg px-2 text-left outline-none"
      onclick={() => show(entry.acct)}>
      {#if entry.setup.label?.avatar}<img src={entry.setup.label.avatar} alt="" class="size-5 rounded-full" />{:else}<Glyph name="user" class="text-muted-foreground size-4" />{/if}
      <span class="min-w-0 flex-1 truncate font-medium">{pageState.accountName(entry.acct)}{#if entry.setup.label?.handle}<span class="text-muted-foreground ml-1.5 font-normal">{entry.setup.label.handle}</span>{/if}</span>
      {#if checked}<Glyph name="check" class="text-primary size-4" />{/if}
    </button>
  {/each}
  <p class="text-muted-foreground px-2 py-1.5 text-[12px]">{i18n.message("pop_setupMenuNote")}</p>
  <hr class="border-border my-1" />
  <button type="button" role="menuitem" class="hover:bg-muted focus-visible:bg-muted min-h-9 rounded-lg px-2 text-left outline-none" onclick={() => { onclose(false); onmanage() }}>{i18n.message("pop_manageSetups")}</button>
  <button type="button" role="menuitem" class="hover:bg-muted focus-visible:bg-muted min-h-9 rounded-lg px-2 text-left outline-none"
    onclick={() => { onclose(false); onopen("https://www.youtube.com/channel_switcher") }}>{i18n.message("note_switchAccount")}</button>
  {#if !pageState.signedIn}
    <button type="button" role="menuitem" class="hover:bg-muted focus-visible:bg-muted min-h-9 rounded-lg px-2 text-left outline-none"
      onclick={() => { onclose(false); onopen(signIn) }}>{i18n.message("firstRun_finish_signIn")}</button>
  {/if}
</div>
