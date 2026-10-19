// THROWAWAY PROTOTYPE (ticket 15). The popup's one overlay: the shared playlist picker, opened from anywhere in the
// popup. It loads on first use (ticket 24) and fills the popup below the header, because 360 px is too narrow for a
// popover beside its button.
import type { PickerRequest } from "$ui/components/picker/request";

export const sheet = $state({ req: null as PickerRequest | null });

export function openPicker(req: PickerRequest) {
  sheet.req = req;
}
export function closePicker() {
  sheet.req = null;
}
