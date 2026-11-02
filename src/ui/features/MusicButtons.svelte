<script lang="ts">
  import { untrack } from "svelte"
  import type { PageState } from "../lib/page-state.svelte"
  import { musicActionName, musicButtons, musicWhere } from "../lib/summaries"

  // Quick actions' ten button checkboxes with their "where" lines, then the narrow-row warning (UI-SET-11, R85).
  let { pageState }: { pageState: PageState } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  let failed = $state(false)
  const buttons = $derived(pageState.settings?.musicActions.buttons)
  async function set(button: (typeof musicButtons)[number], value: boolean) {
    failed = false
    const answer = await backend.change({ kind: "option", field: `musicActions.buttons.${button}`, value } as never)
    failed = answer.kind !== "confirmed"
  }
</script>

{#if buttons}
  <div class="flex flex-col gap-1.5 text-[13px]">
    {#each musicButtons as button (button)}
      <label class="flex items-start gap-2">
        <input type="checkbox" class="mt-1" checked={buttons[button]} disabled={!pageState.editable} onchange={event => set(button, event.currentTarget.checked)} />
        <span>{i18n.message(musicActionName[button])}<span class="text-muted-foreground block text-[12px]">{i18n.message(musicWhere[button])}</span></span>
      </label>
    {/each}
    <p class="text-warning text-[12px]">{i18n.message("musicActions_warning")}</p>
    {#if failed}<p role="status" class="text-destructive text-[12px]">{i18n.message("option_failed")}</p>{/if}
  </div>
{/if}
