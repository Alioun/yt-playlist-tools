<script lang="ts">
  // The prototype skill's floating variant switcher: ← / → (buttons or keys) cycle the popup's variants and write
  // ?variant= to the URL. Keys are ignored while typing. Prototype chrome, deliberately unlike the product.
  import { variants } from "./notes";
  import { h, save } from "./url.svelte";

  const i = $derived(variants.findIndex((v) => v.id === h.variant));
  function go(d: number) {
    h.variant = variants[(i + d + variants.length) % variants.length].id;
    save();
  }
  function onkey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t && (t.closest("input, textarea, select, [contenteditable]") || t.isContentEditable)) return;
    if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
  }
</script>

<svelte:window onkeydown={onkey} />

<div
  class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-zinc-900 px-1.5 py-1.5 text-white shadow-[0_8px_30px_rgb(0_0_0/0.35)] ring-1 ring-white/10"
  role="group"
  aria-label="Popup variant"
>
  <button type="button" class="inline-flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Previous variant" onclick={() => go(-1)}>←</button>
  <span class="min-w-[170px] px-2 text-center text-[13px] font-medium">
    <span class="text-yellow-300">{variants[i]?.id}</span> · {variants[i]?.name}
    <span class="ml-1 text-[11px] text-white/50">{i + 1}/{variants.length}</span>
  </span>
  <button type="button" class="inline-flex size-8 items-center justify-center rounded-full hover:bg-white/10" aria-label="Next variant" onclick={() => go(1)}>→</button>
</div>
