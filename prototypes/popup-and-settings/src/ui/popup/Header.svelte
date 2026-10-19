<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  // The popup's header: the brand, the account in view (avatar, name, @handle; a placeholder while it's read, never a
  // signed-out flash, ticket 11), and Settings. With two or more account setups the account becomes a picker that
  // only changes what the popup shows; it never says "switch" (glossary: account in view).
  import Avatar from "$ui/components/Avatar.svelte";
  import { accountInView, accountsWithSetup, beforeConsent, labelOf, ui } from "$lib/view.svelte";
  import { navigate } from "$lib/nav";

  let { menuOpen = $bindable(false) }: { menuOpen?: boolean } = $props();

  const inView = $derived(accountInView());
  const label = $derived(inView ? labelOf(inView) : null);
  const reading = $derived(ui.account.state === "reading" && !ui.picked);
  const canPick = $derived(!ui.s.env.privateWindow && accountsWithSetup().length >= 2 && !reading);
</script>

<header class="brand-hairline bg-card flex h-[58px] shrink-0 items-center gap-2 pr-2 pl-3">
  <!-- The mark as the packaged SVG (the same file the toolbar icon is made from), not a component: an image costs
       the first view's JS nothing (ticket 24). -->
  <img src="/pigeon.svg" width="30" height="30" alt="" class="dark:hidden" />
  <img src="/pigeon-dark.svg" width="30" height="30" alt="" class="hidden dark:block" />
  <span class="text-[13.5px] font-semibold tracking-[-0.01em]">Playlist Pigeon</span>

  <div class="ml-auto flex min-w-0 items-center">
    {#if beforeConsent()}
      <!-- Before consent nothing is read from YouTube, not even the account (ticket 19 §2.4). -->
    {:else if reading}
      <div class="flex items-center gap-2 px-2" aria-label="Reading which account this tab uses" role="status">
        <span class="bg-muted size-8 animate-pulse rounded-full"></span>
        <span class="flex flex-col gap-1.5">
          <span class="bg-muted h-2.5 w-16 animate-pulse rounded-full"></span>
          <span class="bg-muted h-2 w-12 animate-pulse rounded-full"></span>
        </span>
      </div>
    {:else}
      {#snippet who()}
        <Avatar {label} size={32} />
        <span class="min-w-0 leading-tight">
          <span class="block max-w-[118px] truncate text-[13px] font-medium">{label ? label.name : "Not signed in"}</span>
          <span class="text-muted-foreground block max-w-[118px] truncate text-[11.5px]">
            {label ? (label.handle ?? "No channel") : "YouTube"}
          </span>
        </span>
      {/snippet}
      {#if canPick}
        <button
          type="button"
          class="hover:bg-muted aria-expanded:bg-muted flex min-w-0 items-center gap-2 rounded-lg py-1 pr-1.5 pl-1.5 text-left"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Account in view: {label?.name ?? 'none'}. Show another account's setup"
          onclick={() => (menuOpen = !menuOpen)}
        >
          {@render who()}
          <Glyph name="chevron-down" class="text-muted-foreground size-3.5 shrink-0" />
        </button>
      {:else}
        <div class="flex min-w-0 items-center gap-2 py-1 pr-1.5 pl-1.5">{@render who()}</div>
      {/if}
    {/if}
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground ml-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
      title="All settings"
      aria-label="All settings"
      onclick={() => navigate("settings")}
    >
      <Glyph name="settings" class="size-[18px]" />
    </button>
  </div>
</header>
