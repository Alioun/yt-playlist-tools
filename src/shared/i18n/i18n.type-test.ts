import type { I18n } from "./index"

function messages(i18n: I18n) {
  i18n.message("firstRun_welcome")
  i18n.message("copy_list_two", { first: "A", second: "B" })
  // @ts-expect-error missing-second. Both named placeholders are required.
  i18n.message("copy_list_two", { first: "A" })
  // @ts-expect-error extra-value. The catalogue has no third placeholder.
  i18n.message("copy_list_two", { first: "A", second: "B", third: "C" })
  const extra = { first: "A", second: "B", third: "C" }
  // @ts-expect-error extra-variable. Extra placeholders also fail through a variable.
  i18n.message("copy_list_two", extra)
  // @ts-expect-error missing-object. A parameterized message needs its values.
  i18n.message("copy_list_two")
  // @ts-expect-error simple-extra. A simple message takes no values.
  i18n.message("firstRun_welcome", {})
  // @ts-expect-error unknown-key. Keys derive from the actual JSON.
  i18n.message("invented_message")
  // @ts-expect-error rich-values. Rich messages cannot drop required substitutions.
  i18n.rich("copy_list_two")
  // @ts-expect-error numeric-value. Callers format counts through Intl first.
  i18n.message("firstRun_continue_other", { count: 2 })
}
void messages
