// THROWAWAY PROTOTYPE (ticket 14). Fake stand-ins for ticket 12's add flow, ticket 29's queue, membership reads,
// playlist creation and ticket 18's notices. Nothing is sent anywhere; outcomes come from view.outcome so every state
// can be shown. The copy is ticket 12's and ticket 18's.
import { view, q, listOf, titleOf, log, FEATURE_NAMES, PRODUCT, AUTO, type FeatureId, type Video, type Privacy } from "./view.svelte";
import { showToast, updateToast, dismiss } from "../kit/toaster/toaster.svelte";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
export type Origin = "quick-save" | "shortcut" | "picker" | "auto-add" | "watch-menu";

/** Hooks the page wires up (open settings, open the picker in choose mode). */
export const hooks = {
  openSettings: (where: string) => log(`(would open ${PRODUCT} settings at ${where})`),
  chooseQuickSave: (_video: Video) => {},
};

/** Ticket 12 step 2: an explicit add while signed out answers with the way in; nothing opens. */
export function signedOutAnswer(): boolean {
  if (view.signedIn) return false;
  showToast({ text: "Sign in to YouTube to save videos.", action: { label: "Sign in", run: () => log("(would open YouTube's sign-in page)") } });
  return true;
}

const feedbackOf = (o: Origin) => (o === "shortcut" ? view.feedback.shortcuts : o === "auto-add" ? view.feedback.autoAdd : view.feedback.quickSave);

export async function add(
  video: Video,
  pids: string[],
  origin: Origin,
  opts: { choose?: boolean; pendingAfter?: number } = {},
): Promise<"added" | "already" | "failed"> {
  let pendingId = 0;
  const pendingTimer =
    opts.pendingAfter !== undefined
      ? setTimeout(() => (pendingId = showToast({ text: `Saving ${q(video.title)} to ${listOf(pids)}…`, pending: true })), opts.pendingAfter)
      : undefined;
  await wait(view.outcome.latency);
  clearTimeout(pendingTimer);
  const show = (t: Parameters<typeof showToast>[0]) => (pendingId ? updateToast(pendingId, t) : showToast(t));
  const auto = origin === "auto-add";
  const verb = auto ? "auto-add" : "save";
  const o = view.outcome.save;
  log(`${origin}: ${video.id} → ${pids.join(", ")} (${o})`);
  if (o === "fail") {
    show({ failure: true, unprompted: auto, text: `Couldn't ${verb} ${q(video.title)} to ${listOf(pids)}. Check your connection.`, action: auto ? { label: "Try again", run: () => add(video, pids, origin) } : undefined });
    return "failed";
  }
  if (o === "missing") {
    show({
      failure: true,
      unprompted: auto,
      text: `Couldn't ${verb} ${q(video.title)}: ${titleOf(pids[0])} doesn't exist anymore.`,
      action: origin === "quick-save" ? { label: "Choose", run: () => hooks.chooseQuickSave(video) } : { label: "Settings", run: () => hooks.openSettings(origin) },
    });
    return "failed";
  }
  if (o === "refused") {
    show({ failure: true, unprompted: auto, text: `YouTube doesn't allow saving ${q(video.title)} to playlists.` });
    return "failed";
  }
  const members = view.membership[video.id] ?? [];
  const already = o === "already" ? pids : pids.filter((p) => members.includes(p));
  const fresh = pids.filter((p) => !already.includes(p));
  if (!fresh.length) {
    if (auto) {
      if (pendingId) dismiss(pendingId);
    } else show({ text: `${q(video.title)} is already in ${listOf(already)}` });
    return "already";
  }
  view.membership[video.id] = [...members, ...fresh];
  const undo = async () => {
    await wait(view.outcome.latency);
    view.membership[video.id] = (view.membership[video.id] ?? []).filter((p) => !fresh.includes(p));
    if (auto) view.autoAdd.kind = "skipped";
    log(`undo: ${video.id} out of ${fresh.join(", ")}`);
    return true;
  };
  if (!feedbackOf(origin)) {
    if (pendingId) dismiss(pendingId);
    return "added";
  }
  const text = auto
    ? `Auto-added ${q(video.title)} to ${listOf(fresh)}`
    : opts.choose
      ? `Saved ${q(video.title)} to ${listOf(fresh)}. One click now saves there.`
      : `Saved ${q(video.title)} to ${listOf(fresh)}`;
  show({ text, undo, unprompted: auto });
  return "added";
}

/** Ticket 12 + 29: the queue button's states, confirmed adds, Undo by the entry's own ID. */
export async function queueAdd(video: Video) {
  const id = video.id;
  if (view.queued[id] === "added" || view.queued[id] === "busy") return;
  view.queued[id] = "busy";
  await wait(view.outcome.latency);
  const o = view.outcome.queue;
  log(`queue: ${id} (${o})`);
  if (o === "fail") {
    view.queued[id] = "failed";
    showToast({ failure: true, text: `Couldn't add ${q(video.title)} to the queue. Try YouTube's ⋮ menu.` });
    setTimeout(() => view.queued[id] === "failed" && (view.queued[id] = "idle"), 1500);
    return;
  }
  if (o === "unconfirmed") {
    view.queued[id] = "unconfirmed";
    showToast({ failure: true, text: `Couldn't confirm ${q(video.title)} was added to the queue. Check the miniplayer.` });
    return;
  }
  view.queued[id] = "added";
  if (view.feedback.queue)
    showToast({
      text: `Added ${q(video.title)} to the queue`,
      undo: async () => {
        await wait(view.outcome.latency);
        view.queued[id] = "idle";
        return true;
      },
    });
}

/** A tick in the picker: the same add, but the row is the feedback, so no toast (tickets 12 and 26). */
export async function addFromPicker(video: Video, pid: string): Promise<"added" | "already" | "failed"> {
  await wait(view.outcome.latency);
  const o = view.outcome.save;
  log(`picker: ${video.id} → ${pid} (${o})`);
  if (o === "fail" || o === "missing" || o === "refused") return "failed";
  const members = view.membership[video.id] ?? [];
  if (o === "already" || members.includes(pid)) return "already";
  view.membership[video.id] = [...members, pid];
  return "added";
}

/** Membership for the picker's check marks; null when it can't be read (ticket 12's fallback note). */
export async function membership(videoId: string): Promise<string[] | null> {
  await wait(view.outcome.membershipMs);
  return view.outcome.membershipOk ? [...(view.membership[videoId] ?? [])] : null;
}

/** The picker's untick (PROVISIONAL in tickets 12 and 26: unticking removes). */
export async function remove(video: Video, pid: string): Promise<boolean> {
  await wait(view.outcome.latency);
  if (view.outcome.save === "fail") return false;
  view.membership[video.id] = (view.membership[video.id] ?? []).filter((p) => p !== pid);
  if (AUTO.some((a) => a.id === pid) && view.autoAdd.kind !== "paused") view.autoAdd.kind = "skipped";
  return true;
}

/** Ticket 12's New playlist in the picker: created with the video already in it. */
export async function create(video: Video, title: string, privacy: Privacy): Promise<string> {
  await wait(view.outcome.latency + 400);
  const id = `PLnew${view.playlists.length}`;
  view.playlists = [view.playlists[0], { id, title, privacy, count: 1 }, ...view.playlists.slice(1)];
  view.membership[video.id] = [...(view.membership[video.id] ?? []), id];
  return id;
}

/** Ticket 18's in-page notice: once per browser session per feature, several found at once share one notice. */
let noticeBatch: FeatureId[] = [];
export function notice(features: FeatureId[]) {
  const fresh = features.filter((f) => !view.noticed.includes(f) && !noticeBatch.includes(f));
  if (!fresh.length) return;
  if (!noticeBatch.length) setTimeout(flushNotice, 60);
  noticeBatch.push(...fresh);
}
function flushNotice() {
  const fresh = noticeBatch;
  noticeBatch = [];
  view.noticed.push(...fresh);
  const names = fresh.map((f) => FEATURE_NAMES[f]);
  let text: string;
  if (fresh.length > 1) {
    const list = names.length === 2 ? `${names[0]} and ${names[1].replace(/^The /, "the ")}` : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    text = `${list} aren't working right now because YouTube changed something. Use YouTube's own buttons for now.`;
  } else {
    const f = fresh[0];
    text =
      f === "autoAdd"
        ? "Auto-add isn't working right now because YouTube changed something. Videos you watch aren't being added for now."
        : f === "queue"
          ? "The Add to queue button isn't working right now because YouTube changed something. Use YouTube's ⋮ menu for now."
          : f === "cardMenu"
            ? "The right-click menu isn't working right now because YouTube changed something. You'll get the browser's menu for now."
            : f === "watchButton"
              ? "The watch-page button isn't working right now because YouTube changed something. This video's status is still in the toolbar popup."
              : `${names[0]} isn't working right now because YouTube changed something. Use YouTube's own Save for now.`;
  }
  showToast({ text, failure: true, sticky: true, unprompted: true, action: { label: "Details", run: () => hooks.openSettings("Diagnostics") } });
}
