<script lang="ts">
  // The account in view, top right (glossary: it changes only what settings shows, never YouTube's account).
  // A picker only with two or more account setups and only in a normal window (ticket 11); never worded "switch".
  // A small hand-written menu: Bits UI's DropdownMenu would bring its floating layer into the page's first load.
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Check from "@lucide/svelte/icons/check";
  import Avatar from "$ui/components/Avatar.svelte";
  import { accountInView, accountsWithSetup, beforeConsent, labelOf, setupOf, ui } from "$lib/view.svelte";
  import { openExternal } from "$lib/nav";

  const inView = $derived(accountInView());
  const label = $derived(inView ? labelOf(inView) : null);
  const reading = $derived(ui.account.state === "reading" && !ui.picked);
  const choices = $derived(accountsWithSetup());
  const canPick = $derived(!ui.s.env.privateWindow && choices.length >= 2);
  const tabAcct = $derived(ui.account.state === "ready" ? ui.account.acct : null);
  let open = $state(false);
  let root = $state<HTMLElement | null>(null);

  $effect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root?.contains(e.target as Node) && (open = false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (open = false);
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  });
</script>

<div class="relative flex items-center gap-3" bind:this={root}>
  {#if beforeConsent()}
    <!-- Before consent nothing is read from YouTube, not even the account (ticket 19 §2.4). -->
  {:else if reading}
    <div class="flex items-center gap-2.5" role="status" aria-label="Reading which account your YouTube tab uses">
      <span class="bg-muted h-2.5 w-24 animate-pulse rounded-full"></span>
      <span class="bg-muted size-8 animate-pulse rounded-full"></span>
    </div>
  {:else if !label}
    <span class="text-muted-foreground text-sm">Not signed in to YouTube</span>
    <button type="button" class="text-primary text-sm font-medium hover:underline" onclick={() => openExternal("sign-in")}>Sign in</button>
  {:else}
    <span class="text-muted-foreground hidden text-[13px] sm:inline">{canPick ? "Showing setup for" : "Playlists shown for"}</span>
    {#if canPick}
      <button
        type="button"
        class="hover:bg-muted aria-expanded:bg-muted flex items-center gap-2.5 rounded-xl border py-1 pr-2.5 pl-1.5"
        aria-haspopup="menu"
        aria-expanded={open}
        onclick={() => (open = !open)}
      >
        <Avatar {label} size={28} />
        <span class="text-left leading-tight">
          <span class="block text-[13.5px] font-medium">{label.name}</span>
          <span class="text-muted-foreground block text-[11.5px]">{label.handle ?? "No channel"}</span>
        </span>
        <ChevronDown class="text-muted-foreground size-4" />
      </button>
    {:else}
      <div class="flex items-center gap-2.5">
        <Avatar {label} size={28} />
        <span class="leading-tight">
          <span class="block text-[13.5px] font-medium">{label.name}</span>
          <span class="text-muted-foreground block text-[11.5px]">{label.handle ?? "No channel"}</span>
        </span>
      </div>
    {/if}
  {/if}

  {#if open}
    <div
      class="bg-popover shadow-float animate-in fade-in-0 zoom-in-95 absolute top-full right-0 z-40 mt-2 w-[290px] origin-top-right rounded-xl border p-1.5"
      role="menu"
    >
      <p class="text-muted-foreground px-2.5 pt-1.5 pb-2 text-xs">Show the setup for</p>
      {#each choices as a (a)}
        {@const l = labelOf(a)}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={a === inView}
          class="hover:bg-muted flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left"
          onclick={() => {
            ui.picked = a === tabAcct ? null : a;
            open = false;
          }}
        >
          <Avatar label={l} size={30} />
          <span class="min-w-0 flex-1 leading-tight">
            <span class="flex items-center gap-1.5 text-sm font-medium">
              {l.name}
              {#if a === tabAcct}<span class="bg-muted text-muted-foreground rounded-full px-1.5 py-px text-[10.5px] font-medium">This tab</span>{/if}
            </span>
            <span class="text-muted-foreground block truncate text-xs">
              {l.handle ?? "No channel"}{setupOf(a)?.notLoadedHere ? " · not opened in this browser yet" : ""}
            </span>
          </span>
          {#if a === inView}<Check class="text-primary size-4" />{/if}
        </button>
      {/each}
      <p class="text-muted-foreground border-t px-2.5 pt-2 pb-1 text-[11.5px] leading-4">
        This only changes what settings shows. YouTube stays on the account each tab uses.
      </p>
    </div>
  {/if}
</div>
