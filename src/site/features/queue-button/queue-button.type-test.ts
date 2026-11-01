import type { JobInvocation, JobOf, QueueListId, SetVideoId } from "../../../shared/contracts"
import type { QueueButtonText } from "../../../shared/copy"
import type { I18n } from "../../../shared/i18n"
import type { FeatureDefinition } from "../../core/feature-host"
import type { Scope } from "../../core/scope"
import type { OverlayKit } from "../../kit/overlay"
import { queueButton, outcomeOf, toastOf, type QueueButtonServices, type QueueButtonState, type QueueOutcome } from "./index"

export function queueButtonTypes(services: QueueButtonServices, scope: Scope, kit: OverlayKit, i18n: I18n, text: QueueButtonText,
  listId: QueueListId, setVideoId: SetVideoId, state: QueueButtonState, outcome: QueueOutcome): void {
  const definition: FeatureDefinition<"www", QueueButtonServices> = queueButton
  const add: JobInvocation<JobOf<"queueAdd">> = { job: { kind: "queueAdd" } }
  const undo: JobInvocation<JobOf<"queueUndo">> = { job: { kind: "queueUndo", listId, setVideoId } }
  const lease = kit.use(scope, "queue")
  const reserved = kit.use(scope, "quick-save")
  const label: string = text.label("unconfirmed")
  const named: string = text.toast("failed", "Title")
  const message: string = i18n.message("queueButton_toast_added_named", { title: "Title" })
  const plain: string = i18n.message("queueButton_idle")
  const toast = toastOf(outcome, true)
  const answer = outcomeOf({ ok: false, reason: "unconfirmed" })
  if (state.kind === "added") { const entry: { listId: QueueListId; setVideoId: SetVideoId } | null = state.entry; void entry }
  // @ts-expect-error A queue add carries no account pin.
  const pinned: JobInvocation<JobOf<"queueAdd">> = { job: { kind: "queueAdd" }, acct: services.page }
  // @ts-expect-error Undo requires the branded queue entry, never a video ID.
  const byVideo: JobInvocation<JobOf<"queueUndo">> = { job: { kind: "queueUndo", listId, videoId: "AAAAAAAAAAA" } }
  // @ts-expect-error Undo needs the list and entry identities, not plain strings.
  const unbranded: JobInvocation<JobOf<"queueUndo">> = { job: { kind: "queueUndo", listId: "list", setVideoId: "entry" } }
  // @ts-expect-error Only Added carries an entry.
  const idleEntry = (state.kind === "idle" ? state : null)?.entry
  // @ts-expect-error The overlay has no per-card or speculative slot.
  kit.use(scope, "card-menu")
  // @ts-expect-error The notice collaborator is required.
  const silent: QueueButtonServices = { ...services, notices: undefined }
  // @ts-expect-error Labels come from the five states.
  text.label("queued")
  // @ts-expect-error A titled queue message requires its title.
  i18n.message("queueButton_toast_added_named")
  // @ts-expect-error Simple queue labels take no values.
  i18n.message("queueButton_idle", { title: "Title" })
  // @ts-expect-error A failed outcome cannot claim confirmation.
  const claimed: QueueOutcome = { kind: "failed", reason: "unavailable", quiet: true, entry: null }
  void [definition, add, undo, lease, reserved, label, named, message, plain, toast, answer, pinned, byVideo, unbranded, idleEntry, silent, claimed]
}
