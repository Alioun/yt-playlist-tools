<script lang="ts">
  import { untrack } from "svelte"
  import Switch from "../components/Switch.svelte"
  import type { SharedSettingChange } from "../../shared/contracts/shared-settings"
  import type { PageState } from "../lib/page-state.svelte"

  // One shared on/off option, saved as it's switched (UI-SET-10).
  let { pageState, field, checked, label, note = null }: {
    pageState: PageState
    field: Extract<SharedSettingChange, { kind: "option" }>["field"]
    checked: boolean
    label: string
    note?: string | null
  } = $props()
  const { i18n, backend } = untrack(() => pageState.page)
  let failed = $state(false)
  async function change(value: boolean) {
    failed = false
    const answer = await backend.change({ kind: "option", field, value } as SharedSettingChange)
    failed = answer.kind !== "confirmed"
  }
</script>

<div class="flex items-start justify-between gap-4 py-1.5 text-[13.5px]">
  <span>{label}{#if note}<span class="text-muted-foreground block text-[12.5px]">{note}</span>{/if}
    {#if failed}<span role="status" class="text-destructive block text-[12.5px]">{i18n.message("option_failed")}</span>{/if}</span>
  <Switch {checked} {label} disabled={!pageState.editable} onchange={change} />
</div>
