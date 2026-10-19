<script lang="ts">
  // Settings › YouTube: one card per YouTube feature, in the popup's order. Each says whether it changes the page.
  import FeatureCard from "../parts/FeatureCard.svelte";
  import OptionRow from "../parts/OptionRow.svelte";
  import SectionHeader from "../parts/SectionHeader.svelte";
  import LazyBody from "../parts/LazyBody.svelte";
  import { act, ui } from "$lib/view.svelte";

  const f = $derived(ui.s.features);
  const opt = (id: "queueButton" | "watchButton" | "cardMenu", option: string) => (v: boolean) =>
    act({ kind: "featureOption", id, option, value: v });
</script>

<SectionHeader
  title="YouTube"
  description="What Playlist Pigeon does on youtube.com. Each feature is off until you switch it on, and one that's off leaves nothing on YouTube's pages."
/>

<div class="space-y-4">
  <FeatureCard id="autoAdd"><LazyBody load={() => import("./youtube/AutoAddBody.svelte")} lines={4} /></FeatureCard>
  <FeatureCard id="shortcuts"><LazyBody load={() => import("./youtube/ShortcutsBody.svelte")} /></FeatureCard>
  <FeatureCard id="quickSave"><LazyBody load={() => import("./youtube/QuickSaveBody.svelte")} lines={2} /></FeatureCard>
  <FeatureCard id="queueButton">
    <OptionRow
      label="Show a confirmation"
      description="On by default, because the toast carries Undo. The button also turns into a check once YouTube confirms the video is queued. Failures always show."
      checked={f.queueButton.feedback}
      onchange={opt("queueButton", "feedback")}
    />
  </FeatureCard>
  <FeatureCard id="watchButton">
    <OptionRow
      label="On Shorts too"
      description="Adds the same button as the last action in the Shorts column, above the sound button."
      checked={f.watchButton.onShorts}
      onchange={opt("watchButton", "onShorts")}
    />
  </FeatureCard>
  <FeatureCard id="cardMenu">
    <OptionRow
      label="Links inside cards keep the browser's menu"
      description="Off by default. On, right-clicking the channel name or a link in a card opens the browser's menu, so you can open it in a new tab. Hold Shift for the browser's menu any time."
      checked={f.cardMenu.linksKeepMenu}
      onchange={opt("cardMenu", "linksKeepMenu")}
    />
  </FeatureCard>
</div>
