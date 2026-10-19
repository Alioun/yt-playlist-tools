<script lang="ts">
  // YouTube Music's own chrome: top bar and left nav (low fidelity, nothing of ours).
  import type { Snippet } from "svelte";
  import Search from "@lucide/svelte/icons/search";
  import House from "@lucide/svelte/icons/house";
  import Compass from "@lucide/svelte/icons/compass";
  import Library from "@lucide/svelte/icons/library";
  import Cast from "@lucide/svelte/icons/cast";
  import { app } from "$lib/state.svelte";
  import { accounts } from "$lib/data";
  import { cn } from "$lib/utils";
  import { ui } from "./store.svelte";

  let { children }: { children: Snippet } = $props();
  const acct = $derived(accounts[app.env.account]);
</script>

<div class="flex h-16 shrink-0 items-center gap-4 px-4">
  <span class="flex w-48 items-center gap-1.5 text-lg font-semibold tracking-tight">
    <span class="flex size-6 items-center justify-center rounded-full bg-red-600"><span class="size-2.5 rounded-full border-2 border-white"></span></span>
    Music
  </span>
  <div class="flex max-w-md flex-1 items-center gap-3 rounded-lg bg-white/10 px-3 py-2 text-sm text-white/60">
    <Search class="size-4" /> Search songs, albums, artists, podcasts
  </div>
  <span class="flex-1"></span>
  <Cast class="text-yt-muted size-5" />
  {#if app.env.signedIn}
    <span class={cn("flex size-8 items-center justify-center rounded-full text-sm font-semibold text-white", acct.color)} title={acct.name}
      >{acct.initial}</span
    >
  {:else}
    <span class="rounded-full border border-white/30 px-3 py-1 text-sm">Sign in</span>
  {/if}
</div>
<div class="flex min-h-0 flex-1">
  <nav class="w-48 shrink-0 space-y-1 px-2 pt-2 text-sm">
    {#each [{ id: "home", label: "Home", icon: House }, { id: "explore", label: "Explore", icon: Compass }, { id: "library", label: "Library", icon: Library }] as n (n.id)}
      <button
        type="button"
        class={cn("flex w-full items-center gap-4 rounded-lg px-3 py-2.5 text-left", ui.page === "home" && n.id === "home" ? "bg-white/10" : "hover:bg-white/5")}
        onclick={() => n.id === "home" && (ui.page = "home")}
      >
        <n.icon class="size-5" />
        {n.label}
      </button>
    {/each}
  </nav>
  <div class="min-w-0 flex-1 overflow-auto">
    {@render children()}
  </div>
</div>
