<script lang="ts">
  import clsx from "clsx"
  import { untrack } from "svelte"
  import type { PageState } from "../../lib/page-state.svelte"

  // Settings › Appearance (UI-SET-15): System, Light or Dark as cards with a mini popup.
  let { pageState }: { pageState: PageState } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  let theme = $derived(pageState.settings?.theme ?? "system")
  const uid = $props.id()
  let failed = $state(false)
  async function pick(value: "system" | "light" | "dark") {
    failed = false
    failed = (await backend.change({ kind: "theme", value })).kind !== "confirmed"
    if (failed) theme = pageState.settings?.theme ?? "system"
  }
  const themes = [["system", "set_theme_system"], ["light", "set_theme_light"], ["dark", "set_theme_dark"]] as const
</script>

<div class="flex flex-col gap-3">
  <div role="radiogroup" aria-label={i18n.message("set_nav_appearance")} class="grid grid-cols-1 gap-3 sm:grid-cols-3">
    {#each themes as [value, label] (value)}
      <label class={clsx("bg-card focus-within:ring-ring/40 flex cursor-pointer flex-col gap-2 rounded-2xl border p-3 text-left focus-within:ring-3", theme === value ? "border-primary ring-primary/30 ring-2" : "hover:border-foreground/20")}>
        <input class="sr-only" type="radio" name="{uid}-theme" {value} bind:group={theme} disabled={!pageState.editable} onchange={() => pick(value)} />
        <span aria-hidden="true" class={clsx("flex h-16 flex-col gap-1 rounded-lg border p-2", value === "dark" ? "bg-[#1d2027]" : value === "light" ? "bg-white" : "bg-[linear-gradient(90deg,#fff_50%,#1d2027_50%)]")}>
          <span class="bg-brand-gradient h-1.5 w-10 rounded-full"></span><span class="h-1.5 w-16 rounded-full bg-[#8a8f98]/50"></span><span class="h-1.5 w-12 rounded-full bg-[#8a8f98]/50"></span>
        </span>
        <span class="text-[13.5px] font-medium">{i18n.message(label)}</span>
      </label>
    {/each}
  </div>
  <p class="text-muted-foreground text-[13px]">{i18n.message("set_themeLine")}</p>
  {#if failed}<p role="status" class="text-destructive text-[13px]">{i18n.message("option_failed")}</p>{/if}
</div>
