import type { I18n } from "../i18n"

/** Names joined as YT-ADD-18 lists them: "A", "A and B", "A, B and C", "A, B and 3 more". */
export function list(names: readonly string[], i18n: I18n): string {
  const first = names[0] ?? "", second = names[1] ?? "", third = names[2] ?? ""
  if (names.length <= 1) return first
  if (names.length === 2) return i18n.message("copy_list_two", { first, second })
  if (names.length === 3) return i18n.message("copy_list_three", { first, second, third })
  return i18n.message("copy_list_more", { first, second, count: i18n.number(names.length - 2) })
}
