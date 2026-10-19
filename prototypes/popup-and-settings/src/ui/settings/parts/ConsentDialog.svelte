<script lang="ts">
  import "../settings-more.css";
  // "Before this feature can run" (ticket 19 §4.1): switching a feature on before agreeing asks here first. On
  // Chrome, a YouTube Music feature's site access is asked for from the same Agree click (ticket 10).
  import { Button } from "$ui/components/ui/button/index.js";
  import Disclosure from "$ui/components/Disclosure.svelte";
  import SettingsDialog from "./SettingsDialog.svelte";
  import { feature } from "$shared/features/registry";
  import { agreeAndTurnOn, ui } from "$lib/view.svelte";

  const id = $derived(ui.consentAsk?.feature ?? null);
  let open = $state(true);
  $effect(() => {
    if (!open) ui.consentAsk = null;
  });
</script>

{#if id}
  <SettingsDialog bind:open title="Before this feature can run" width="lg">
    <Disclosure browser={ui.s.env.browser} />
    {#if feature[id].site === "music" && ui.s.env.browser === "chrome" && !ui.s.env.access.music}
      <p class="text-muted-foreground mt-3 text-[13px]">Chrome will ask for access to music.youtube.com when you agree.</p>
    {/if}
    {#snippet footer()}
      <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
      <Button onclick={() => agreeAndTurnOn(id)}>Agree and turn on {feature[id].name}</Button>
    {/snippet}
  </SettingsDialog>
{/if}
