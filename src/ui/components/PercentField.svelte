<script lang="ts">
  // A slider with a brand fill and a number field (UI-PICK-22). The field saves on Enter or blur and puts back
  // empty or out-of-range input; the slider saves on release.
  let { value, label, start, full, disabled = false, onsave }: {
    value: number
    label: string
    start: string
    full: string
    disabled?: boolean
    onsave: (next: number) => void
  } = $props()
  const uid = $props.id()
  let sliding = $state<number | null>(null)
  let typed = $state<string | null>(null)
  const shown = $derived(sliding ?? value)

  function commitField(input: HTMLInputElement) {
    const text = input.value.trim()
    const next = Number(text)
    typed = null
    if (text === "" || !Number.isInteger(next) || next < 0 || next > 100) { input.value = String(value); return }
    if (next !== value) onsave(next)
  }
  function release(input: HTMLInputElement) {
    const next = Number(input.value)
    sliding = null
    if (next !== value) onsave(next)
  }
</script>

<div class="flex flex-col gap-1.5">
  <div class="flex items-center gap-3">
    <input
      id="{uid}-slider"
      type="range"
      min="0"
      max="100"
      step="1"
      aria-label={label}
      aria-valuetext="{shown} %"
      {disabled}
      value={shown}
      style="--fill: {shown}%"
      class="percent-slider h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full disabled:opacity-50"
      oninput={event => { sliding = Number(event.currentTarget.value) }}
      onchange={event => release(event.currentTarget)}
    />
    <span class="flex items-center gap-1 text-sm">
      <input
        type="text"
        inputmode="numeric"
        aria-label={label}
        {disabled}
        value={typed ?? String(shown)}
        class="border-input bg-background focus-visible:ring-ring/40 h-8 w-12 rounded-md border px-2 text-right tabular-nums outline-none focus-visible:ring-3"
        oninput={event => { typed = event.currentTarget.value }}
        onkeydown={event => { if (event.key === "Enter") { event.preventDefault(); commitField(event.currentTarget) } }}
        onblur={event => { if (typed !== null) commitField(event.currentTarget) }}
      />
      <span aria-hidden="true">%</span>
    </span>
  </div>
  <div class="text-muted-foreground flex justify-between text-[12px]"><span>{start}</span><span>{full}</span></div>
</div>

<style>
  .percent-slider {
    background: linear-gradient(90deg, var(--brand-teal), var(--brand-violet)) 0 / var(--fill) 100% no-repeat, var(--input);
  }
  .percent-slider::-webkit-slider-thumb {
    appearance: none; width: 16px; height: 16px; border-radius: 9999px; background: var(--card);
    box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgb(0 0 0 / 0.2);
  }
  .percent-slider::-moz-range-thumb {
    width: 16px; height: 16px; border: 0; border-radius: 9999px; background: var(--card);
    box-shadow: 0 0 0 1px var(--border), 0 1px 2px rgb(0 0 0 / 0.2);
  }
</style>
