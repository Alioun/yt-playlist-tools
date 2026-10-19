<script lang="ts">
  // Ticket 07's required percentage: a 0–100 slider plus a field. Nothing half-typed is ever saved (1.5.0 stored 0
  // the moment the field was emptied): the field saves on Enter or when it loses focus, empty or out-of-range input
  // goes back to the saved value, and the slider saves when it's released.
  import { Slider } from "$ui/components/ui/slider/index.js";

  let {
    value,
    onchange,
    compact = false,
    label = "Required percentage",
    disabled = false,
  }: { value: number; onchange: (v: number) => void; compact?: boolean; label?: string; disabled?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let live = $state(value);
  // svelte-ignore state_referenced_locally
  let text = $state(String(value));
  let editing = $state(false);
  $effect(() => {
    if (!editing) {
      live = value;
      text = String(value);
    }
  });
  const id = `pct-${Math.random().toString(36).slice(2, 7)}`;

  function commitText() {
    editing = false;
    const n = Number(text.trim());
    if (text.trim() === "" || !Number.isInteger(n) || n < 0 || n > 100) {
      text = String(value);
      live = value;
      return;
    }
    if (n !== value) onchange(n);
  }
</script>

<div class={compact ? "space-y-2" : "space-y-3"}>
  <div class="flex items-center justify-between gap-3">
    <label for={id} class="{compact ? 'text-xs' : 'text-[13px]'} font-medium">{label}</label>
    <div class="border-input bg-card focus-within:border-ring focus-within:ring-ring/40 flex h-7 items-center rounded-lg border pr-2 focus-within:ring-3">
      <input
        {id}
        {disabled}
        inputmode="numeric"
        class="h-full w-10 bg-transparent pr-0.5 text-right text-[13px] font-medium tabular-nums outline-none"
        value={text}
        aria-describedby="{id}-ends"
        oninput={(e) => {
          editing = true;
          text = (e.currentTarget as HTMLInputElement).value.replace(/[^\d]/g, "").slice(0, 3);
          const n = Number(text);
          if (text !== "" && n >= 0 && n <= 100) live = n;
        }}
        onkeydown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          if (e.key === "Escape") {
            text = String(value);
            live = value;
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        onblur={commitText}
      />
      <span class="text-muted-foreground text-[13px]">%</span>
    </div>
  </div>
  <Slider
    type="single"
    {disabled}
    min={0}
    max={100}
    step={1}
    value={live}
    aria-label={label}
    onValueChange={(v: number) => {
      live = v;
      text = String(v);
    }}
    onValueCommit={(v: number) => v !== value && onchange(v)}
  />
  <div id="{id}-ends" class="text-muted-foreground flex justify-between text-[11px] leading-4">
    <span>As soon as it starts playing</span><span>Only when watched in full</span>
  </div>
</div>
