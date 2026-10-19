<script lang="ts">
  import Glyph from "$ui/components/Glyph.svelte";
  // Ticket 18's strip: what isn't fully working in this tab, above the one banner, with Details (Settings ›
  // Diagnostics). Amber like the toolbar's "!", with its own icon.
  import { strip as pickStrip } from "$lib/notices";
  import { ui } from "$lib/view.svelte";
  import { navigate } from "$lib/nav";
  const strip = $derived(pickStrip(ui.s.env.activeSite === "music" ? "music" : "youtube"));
</script>

{#if strip}
  <div class="bg-warning-soft text-warning flex shrink-0 items-center gap-2 border-b px-3 py-2 text-xs" role="status">
    <Glyph name="circle-alert" class="size-4 shrink-0" />
    <span class="text-foreground/85 min-w-0 flex-1 leading-4">{strip.text}</span>
    <button
      type="button"
      class="text-foreground hover:bg-card/70 shrink-0 rounded-md px-1.5 py-1 font-medium underline-offset-2 hover:underline"
      onclick={() => navigate("settings", "diagnostics")}>Details</button
    >
  </div>
{/if}
