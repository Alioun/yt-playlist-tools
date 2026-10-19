// THROWAWAY PROTOTYPE (ticket 27). Toast copy: ticket 26's table, ticket 28's moves, ticket 18's notices.
// Titles in double quotes, cut at 40 characters with "…"; playlist titles unquoted (ticket 12).
export const q = (title: string) => `"${title.length > 40 ? title.slice(0, 40).trimEnd() + "…" : title}"`;
const pl = (title: string) => (title.length > 40 ? title.slice(0, 40).trimEnd() + "…" : title);
const songs = (n?: number) => (n ? `${n} song${n === 1 ? "" : "s"} from ` : "");

export const copy = {
  playNext: (t: string, block?: { count?: number }) => (block ? `${songs(block.count)}${q(t)} will play next` : `${q(t)} will play next`),
  addToQueue: (t: string, block?: { count?: number }) => (block ? `Added ${songs(block.count)}${q(t)} to the queue` : `Added ${q(t)} to the queue`),
  playing: (t: string) => `Playing ${q(t)}`,
  movedNext: (t: string) => `Moved ${q(t)} to play next`,
  movedEnd: (t: string) => `Moved ${q(t)} to the end of the queue`,
  alreadyNext: (t: string) => `${q(t)} already plays next`,
  alreadyEnd: (t: string) => `${q(t)} is already at the end of the queue`,
  removed: (t: string) => `Removed ${q(t)} from the queue`,
  saved: (t: string, list: string) => `Saved ${q(t)} to ${pl(list)}`,
  savedFirst: (t: string, list: string) => `Saved ${q(t)} to ${pl(list)}. One click now saves there.`,
  alreadyIn: (t: string, list: string) => `${q(t)} is already in ${pl(list)}`,
  saving: (t: string, list: string) => `Saving ${q(t)} to ${pl(list)}…`,
  liked: (t: string) => `Liked ${q(t)}`,
  unliked: (t: string) => `Unliked ${q(t)}`,
  failQueue: (t: string) => `Couldn't add ${q(t)} to the queue. Try YouTube Music's ⋮ menu.`,
  failMove: (t: string) => `Couldn't move ${q(t)}. Try YouTube Music's ⋮ menu.`,
  failSave: (t: string, list: string) => `Couldn't save ${q(t)} to ${pl(list)}. Try YouTube Music's ⋮ menu.`,
  failRemove: (t: string) => `Couldn't remove ${q(t)} from the queue. Try YouTube Music's ⋮ menu.`,
  failLike: (t: string) => `Couldn't like ${q(t)}. Try YouTube Music's ⋮ menu.`,
  deleted: (list: string) => `${pl(list)} doesn't exist anymore`,
  nothingPlaying: "Nothing is playing",
  pointAtQueue: "Point at a song in the queue to remove it",
  saveSongsOnly: "Save works on songs, not albums or playlists",
  likeSongsOnly: "Like works on songs, not albums or playlists",
  signInSave: "Sign in to YouTube Music to save songs",
  signInLike: "Sign in to YouTube Music to like songs",
  casting: "Not available while casting",
  ad: "An ad is playing",
  playingAlready: "That's the song that's playing",
  autoplayCantMove: "Autoplay suggestions can't be moved. Use YouTube Music's ⋮ menu to add a copy.",
  nothingToUndo: "Nothing to undo.",
  notice: (actions: string[]) =>
    `${actions.length > 1 ? actions.slice(0, -1).join(", ") + " and " + actions.at(-1) + " aren't" : actions[0] + " isn't"} working right now because YouTube Music changed something. Use its ⋮ menu for now.`,
  noticeKey: (action: string, key: string) => `${action} (${key}) isn't working right now because YouTube Music changed something. Use its ⋮ menu for now.`,
  unrecognised: "Couldn't tell which song you're pointing at because YouTube Music changed something. Move the pointer off it to act on the playing song.",
};
