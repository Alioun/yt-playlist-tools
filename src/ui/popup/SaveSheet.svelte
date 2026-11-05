<script lang="ts">
  import { onDestroy, untrack } from "svelte"
  import Modal from "../components/Modal.svelte"
  import { PickerPanel, createPickerText, pickerHelpUrl } from "../picker"
  import { PickerModel } from "../../shared/picker/model.svelte"
  import { sheetSource, type SheetTarget } from "../features/source"
  import type { PageState } from "../lib/page-state.svelte"

  // The popup's picker sheet (UI-PICK-02, UI-POP-25): save mode for This video's Save to… or Playing now's ▾, sliding
  // up under the header and loaded on demand. Every tick runs in the target's own tab, as that tab's account.
  let { pageState, target, onclose }: { pageState: PageState; target: SheetTarget; onclose: () => void } = $props()
  const state = untrack(() => pageState)
  const { i18n, platform } = state.page
  const text = createPickerText(i18n)
  // The sheet is made for one target; a new target opens a new sheet.
  const source = sheetSource(state, untrack(() => target))
  const picker = new PickerModel({ source, site: untrack(() => target).site, mode: "save" })
  onDestroy(() => { picker.close(); source.dispose() })
</script>

<Modal {onclose} label={i18n.message("picker_listLabel")}
  class="bg-card absolute inset-x-0 top-[58px] bottom-0 z-20 flex h-[calc(100%_-_58px)] w-full flex-col overflow-hidden border-t shadow-lg">
  <PickerPanel {picker} {text} purpose={{ kind: "save" }} platform={platform.os} onrequestclose={onclose} onoutcome={() => {}}
    onhelp={action => state.page.open(pickerHelpUrl[action])} />
</Modal>
