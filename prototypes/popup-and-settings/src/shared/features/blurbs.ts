// THROWAWAY PROTOTYPE (ticket 15). Each feature's one line, for settings and first run.
import type { FeatureId } from "../model/types";

export const blurbs: Record<FeatureId, string> = {
  autoAdd: "Adds the videos you watch to your chosen playlists once you've watched enough of them.",
  shortcuts: "Keys that save the video you're pointing at or watching. Alt+W saves to Watch later.",
  quickSave: "A save button on thumbnails: one click saves to your quick-save playlist, and ▾ picks another.",
  queueButton: "A button on thumbnails that adds the video to the end of the queue.",
  watchButton: "A button in YouTube's row under the video, before Save, that shows auto-add's status, with Save to…, Don't auto-add this video and this channel's filter.",
  cardMenu: "Right-clicking a video opens YouTube's own ⋮ menu. Hold Shift for the browser's menu.",
  musicQuickActions: "Play next, Add to queue and more, one click away on songs, albums and playlists.",
  musicShortcuts: "A key for each quick action. It acts on the song you're pointing at, else the one playing.",
};
