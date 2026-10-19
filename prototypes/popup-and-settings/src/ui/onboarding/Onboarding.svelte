<script lang="ts">
  // THROWAWAY PROTOTYPE (ticket 15). The onboarding page: first run, or the 1.4.5 upgrade note. Which one is decided
  // once when the page opens, so the note stays on screen after Agree and shows its outcome in place (ticket 19 §3).
  import Lazy from "$ui/components/Lazy.svelte";
  import { ui } from "$lib/view.svelte";
  import { param } from "$lib/params";

  const mode = param("mode") === "upgrade" || (param("mode") !== "first-run" && ui.s.upgrade === "pending") ? "upgrade" : "first-run";
  document.title = mode === "upgrade" ? "Playlist Pigeon 2.0" : "Welcome to Playlist Pigeon";
</script>

<div class="relative min-h-screen overflow-x-hidden">
  <!-- A faint wash of the brand's teal and violet behind the header; nothing else on the page is tinted. -->
  <div
    class="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-90 dark:opacity-60"
    style="background: radial-gradient(60% 70% at 30% 0%, color-mix(in oklch, var(--brand-teal) 13%, transparent), transparent 70%), radial-gradient(55% 65% at 75% 0%, color-mix(in oklch, var(--brand-violet) 14%, transparent), transparent 70%);"
    aria-hidden="true"
  ></div>
  <div class="relative">
    {#if mode === "upgrade"}
      <Lazy load={() => import("./UpgradeNote.svelte")} />
    {:else}
      <Lazy load={() => import("./FirstRun.svelte")} />
    {/if}
  </div>
</div>
