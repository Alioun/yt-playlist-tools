<script lang="ts">
  import "../settings-more.css";
  // Settings › About (ticket 22): the name, version, the former name, and the attribution line where the extension
  // names YouTube. Name PROVISIONAL until the user confirms it.
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import PigeonMark from "$ui/components/PigeonMark.svelte";
  import { Button } from "$ui/components/ui/button/index.js";
  import { BRAND } from "$shared/features/registry";
  import { openExternal } from "$lib/nav";
</script>

<section class="bg-card shadow-soft overflow-hidden rounded-2xl border">
  <div class="relative flex flex-col items-center px-8 pt-10 pb-8 text-center">
    <div class="bg-brand-gradient pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-80"></div>
    <PigeonMark size={104} title="Playlist Pigeon" />
    <h1 class="mt-4 text-[24px] leading-8 font-semibold tracking-[-0.02em]">{BRAND.full}</h1>
    <p class="text-muted-foreground mt-1 text-sm">Version {BRAND.version} · formerly {BRAND.formerly}</p>
    <p class="text-foreground/80 mt-4 max-w-[52ch] text-[15px] leading-6">
      Files the YouTube videos you watch into your own playlists, and puts YouTube Music's queue, save and like one click away.
    </p>
    <div class="mt-6 flex flex-wrap justify-center gap-2">
      <Button size="sm" variant="outline" onclick={() => openExternal("github-known")}>Source code <ExternalLink /></Button>
      <Button size="sm" variant="outline" onclick={() => openExternal("privacy-policy")}>Privacy policy <ExternalLink /></Button>
      <Button size="sm" variant="outline" onclick={() => openExternal("github-report")}>Report a problem <ExternalLink /></Button>
    </div>
  </div>
  <div class="text-muted-foreground bg-muted/40 space-y-1 border-t px-8 py-4 text-center text-[12.5px] leading-5">
    <p>{BRAND.attribution}</p>
    <p>{BRAND.notAffiliated}</p>
  </div>
</section>
