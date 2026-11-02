import type { UpgradeNoteFlag, UpgradeNoteFlagResult } from "../store/upgrade-note-flag"

export type NoteOpenerPorts = {
  readonly device: () => Promise<unknown>
  readonly mark: (flag: UpgradeNoteFlag) => Promise<UpgradeNoteFlagResult>
  /** Opens the first-run page's note in a background tab beside the current one. */
  readonly open: () => Promise<boolean>
}
const record = (value: unknown): value is Readonly<Record<string, unknown>> => value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * Opens the upgrade note once after the migration, and once more at a browser start if nobody saw it
 * (REL-CON-01, REL-CON-02, REL-CON-25). A restart of the background alone never reopens it.
 */
export async function openUpgradeNote(ports: NoteOpenerPorts, browserStart: boolean): Promise<"opened" | "reopened" | "none"> {
  const device = await ports.device()
  const note = record(device) ? device.upgradeNote : undefined
  if (!record(note) || note.state !== "pending") return "none"
  if (note.opened !== true) return await ports.open() && await ports.mark("opened") === "set" ? "opened" : "none"
  if (!browserStart || note.seen === true || note.reopened === true) return "none"
  return await ports.open() && await ports.mark("reopened") === "set" ? "reopened" : "none"
}
