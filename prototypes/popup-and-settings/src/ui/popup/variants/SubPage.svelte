<script lang="ts">
  import "../parts/parts.css";
  // Variants B and C: a feature's own page inside the popup, sliding in over the list, with a back arrow and the
  // feature's switch in its header. Same content as variant A's unfolded row, at the popup's full width.
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import { Switch } from "$ui/components/ui/switch/index.js";
  import FeatureIcon from "$ui/components/FeatureIcon.svelte";
  import Lazy from "$ui/components/Lazy.svelte";
  import { feature } from "$shared/features/registry";
  import type { FeatureId } from "$shared/model/types";
  import { setFeature, ui } from "$lib/view.svelte";

  let { id, onback }: { id: FeatureId; onback: () => void } = $props();
  const parts: Partial<Record<FeatureId, () => Promise<{ default: never }>>> = {
    autoAdd: () => import("../parts/AutoAddPart.svelte") as never,
    shortcuts: () => import("../parts/ShortcutsPart.svelte") as never,
    quickSave: () => import("../parts/QuickSavePart.svelte") as never,
    musicQuickActions: () => import("../parts/MusicActionsPart.svelte") as never,
    musicShortcuts: () => import("../parts/MusicKeysPart.svelte") as never,
  };
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onback()} />

<div class="bg-background animate-in slide-in-from-right-8 fade-in-0 absolute inset-x-0 top-[58px] bottom-0 z-20 flex flex-col duration-200">
  <div class="bg-card flex h-12 shrink-0 items-center gap-2 border-b pr-3 pl-1.5">
    <button
      type="button"
      class="text-muted-foreground hover:bg-muted hover:text-foreground inline-flex size-8 items-center justify-center rounded-lg"
      aria-label="Back"
      onclick={onback}><ArrowLeft class="size-4" /></button
    >
    <FeatureIcon {id} on={ui.s.features[id].on} size={26} />
    <span class="min-w-0 flex-1 truncate text-[13.5px] font-semibold">{feature[id].name}</span>
    <Switch checked={ui.s.features[id].on} aria-label={feature[id].name} onCheckedChange={(v) => setFeature(id, v)} />
  </div>
  <div class="min-h-0 flex-1 overflow-y-auto p-3">
    <div class="bg-card rounded-xl border p-3">
      {#if parts[id]}<Lazy load={parts[id]!} />{/if}
    </div>
  </div>
</div>
