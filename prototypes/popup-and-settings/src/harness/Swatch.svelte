<script lang="ts">
  // One colour token: its chip, resolved hex, and contrast against the surface it's used on (read from the real
  // CSS variables, so the sheet can't drift from src/ui/lib/theme.css).
  let {
    name,
    color,
    on = "var(--card)",
    text = true,
    note = "",
  }: { name: string; color: string; on?: string; text?: boolean; note?: string } = $props();

  let fg = $state<HTMLSpanElement | null>(null);
  let bg = $state<HTMLSpanElement | null>(null);
  let hex = $state("");
  let ratio = $state(0);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  function rgb(css: string): [number, number, number] {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  const lum = (c: [number, number, number]) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  $effect(() => {
    if (!fg || !bg) return;
    const a = rgb(getComputedStyle(fg).color);
    const b = rgb(getComputedStyle(bg).color);
    hex = "#" + a.map((v) => v.toString(16).padStart(2, "0")).join("");
    const [l1, l2] = [lum(a), lum(b)];
    ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
  const grade = $derived(ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : ratio >= 3 ? "AA large / UI" : "decorative");
</script>

<div class="flex items-center gap-3">
  <span class="ring-foreground/10 size-10 shrink-0 rounded-lg ring-1 ring-inset" style="background:{color}"></span>
  <span class="min-w-0 leading-tight">
    <span class="text-foreground block text-[13px] font-medium">{name}</span>
    <span class="text-muted-foreground block font-mono text-[11px]">{hex}</span>
    {#if text}
      <span class="text-muted-foreground block text-[11px]">
        {ratio.toFixed(2)}:1 · <span class={ratio >= 4.5 ? "text-success" : ratio >= 3 ? "text-warning" : ""}>{grade}</span>{note ? ` · ${note}` : ""}
      </span>
    {:else if note}
      <span class="text-muted-foreground block text-[11px]">{note}</span>
    {/if}
  </span>
  <span bind:this={fg} class="hidden" style="color:{color}"></span>
  <span bind:this={bg} class="hidden" style="color:{on}"></span>
</div>
