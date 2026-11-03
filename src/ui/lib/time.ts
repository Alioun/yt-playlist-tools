import type { I18n } from "../../shared/i18n"

const units: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000]
]
/** "2 hours ago", for saved-data stamps and recent adds (UI-POP-27, UI-POP-34). */
export function relativeTime(i18n: I18n, at: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - at)
  for (const [unit, size] of units) if (elapsed >= size) return i18n.relative(-Math.floor(elapsed / size), unit)
  return i18n.relative(0, "minute")
}
